import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '@/store/project';
import {
  aggregateBuilding, aggregateComponent, aggregateLCCScenario, buildSankeyFlows,
  computeAreaElement, computeColumnElement,
  computeFloorElement, computeInteriorWallElement, computeWindowElement,
  type LCCItem,
} from '@/engine';
import type { ComponentResult, ElementResult } from '@/engine/types';
import type { SankeyItem } from '@/engine/sankey';
import {
  CATEGORY_LABEL_KEY, CLADDING_TEMPLATE, FLOORS_TEMPLATE, GROUPS, GROUP_LABEL_KEY,
  INTERIOR_WALLS_TEMPLATE, RC_MONO_TEMPLATES, WINDOWS_TEMPLATE,
  type AnyCategory,
} from '@/templates/RC/allRegistry';
import { AnalysisResults } from '@/components/AnalysisResults';
import { fmtInt, fmtNum, fmtPct } from '@/lib/format';

export function DashboardRoute() {
  const { t } = useTranslation();
  const elements = useProject((s) => s.elements);
  const areaElements = useProject((s) => s.areaElements);
  const windowElements = useProject((s) => s.windowElements);
  const lifecycleElements = useProject((s) => s.lifecycleElements);
  const buildingClass = useProject((s) => s.meta.buildingClass);

  const { building, perCategory, buildingSummary, flows, lccScenarios } = useMemo(() => {
    const rows: Array<{ cat: AnyCategory; result: ComponentResult }> = [];
    const sankeyItems: SankeyItem[] = [];
    const lccItems: LCCItem[] = [];

    // ---- RC mono categories (columns / beams / slabs / walls — treated as
    //      structural RC: mineral → B5 in both scenarios).
    for (const cat of ['columns', 'beams', 'slabs', 'walls'] as const) {
      const tpl = RC_MONO_TEMPLATES[cat];
      const source = t(CATEGORY_LABEL_KEY[cat]);
      const okResults: ElementResult[] = [];
      for (const el of elements[cat] ?? []) {
        try {
          const result = computeColumnElement(el, tpl);
          okResults.push(result);
          sankeyItems.push({
            source, green: el.greenDemolition, hints: '鋼筋',
            isStructural: true, result,
          });
          lccItems.push({
            green: el.greenDemolition, hints: '鋼筋',
            isStructural: true, layer: '結構', mat: result,
          });
        } catch { /* skip bad element */ }
      }
      rows.push({ cat, result: aggregateComponent(tpl.category, okResults) });
    }

    // ---- 外裝 (cladding)
    {
      const source = t(CATEGORY_LABEL_KEY.cladding);
      const okResults: ElementResult[] = [];
      for (const el of areaElements.cladding ?? []) {
        try {
          const result = computeAreaElement(el, CLADDING_TEMPLATE);
          okResults.push(result);
          sankeyItems.push({
            source,
            green: el.greenDemolition,
            hints: el.constructionType || '',
            isStructural: false,
            result,
          });
          lccItems.push({
            green: el.greenDemolition,
            hints: el.constructionType || '',
            isStructural: false,
            layer: '外裝',
            mat: result,
          });
        } catch { /* skip */ }
      }
      rows.push({ cat: 'cladding', result: aggregateComponent(CLADDING_TEMPLATE.category, okResults) });
    }

    // ---- 外窗 (windows)
    {
      const source = t(CATEGORY_LABEL_KEY.windows);
      const okResults: ElementResult[] = [];
      for (const el of windowElements ?? []) {
        try {
          const result = computeWindowElement(el, WINDOWS_TEMPLATE);
          okResults.push(result);
          sankeyItems.push({
            source,
            green: el.greenDemolition,
            hints: el.frame || '',
            isStructural: false,
            result,
          });
          lccItems.push({
            green: el.greenDemolition,
            hints: el.frame || '',
            isStructural: false,
            layer: '外裝',
            mat: result,
          });
        } catch { /* skip */ }
      }
      rows.push({ cat: 'windows', result: aggregateComponent(WINDOWS_TEMPLATE.category, okResults) });
    }

    // ---- 內牆 / 地坪 (interior walls + floors)
    {
      const source = t(CATEGORY_LABEL_KEY.interiorWalls);
      const okResults: ElementResult[] = [];
      for (const el of lifecycleElements.interiorWalls ?? []) {
        try {
          const result = computeInteriorWallElement(el, INTERIOR_WALLS_TEMPLATE, buildingClass);
          okResults.push(result);
          sankeyItems.push({
            source,
            green: el.greenDemolition,
            hints: el.constructionType || '',
            isStructural: false,
            result,
          });
          lccItems.push({
            green: el.greenDemolition,
            hints: el.constructionType || '',
            isStructural: false,
            layer: '內裝',
            mat: result,
          });
        } catch { /* skip */ }
      }
      rows.push({ cat: 'interiorWalls', result: aggregateComponent(INTERIOR_WALLS_TEMPLATE.category, okResults) });
    }
    {
      const source = t(CATEGORY_LABEL_KEY.floors);
      const okResults: ElementResult[] = [];
      for (const el of lifecycleElements.floors ?? []) {
        try {
          const result = computeFloorElement(el, FLOORS_TEMPLATE, buildingClass);
          okResults.push(result);
          sankeyItems.push({
            source,
            green: el.greenDemolition,
            hints: el.constructionType || '',
            isStructural: false,
            result,
          });
          lccItems.push({
            green: el.greenDemolition,
            hints: el.constructionType || '',
            isStructural: false,
            layer: '內裝',
            mat: result,
          });
        } catch { /* skip */ }
      }
      rows.push({ cat: 'floors', result: aggregateComponent(FLOORS_TEMPLATE.category, okResults) });
    }

    const building = aggregateBuilding(rows.map((r) => r.result));

    // Synthesize a ComponentResult so we can reuse <AnalysisResults />.
    // BCI is the building-level SCIp (mass-weighted mean of component SCIp);
    // every other field already mirrors ComponentResult 1:1.
    const buildingSummary: ComponentResult = {
      category: 'building',
      elementCount: 0,
      M: building.M,
      massMineral: building.massMineral,
      massMetal: building.massMetal,
      massGlass: building.massGlass,
      massWood: building.massWood,
      massPlastic: building.massPlastic,
      massOther: building.massOther,
      wasteB5: building.wasteB5,
      wasteR1301: building.wasteR1301,
      wasteR1304: building.wasteR1304,
      wasteR0401: building.wasteR0401,
      wasteR0701: building.wasteR0701,
      wasteR0201: building.wasteR0201,
      wasteR0503: building.wasteR0503,
      CI_CON: building.CI_CON,
      CI_USE: building.CI_USE,
      CI_EOL: building.CI_EOL,
      MCIp: building.MCIp,
      PCI: building.PCI,
      SCIp: building.BCI,
      baselineEC: building.baselineEC,
      designEC: building.designEC,
      reduction: building.reduction,
      reductionRatio: building.reductionRatio,
      cost: building.cost,
      lccC1: building.lccC1,
      lccC2: building.lccC2,
      lccD: building.lccD,
      lccNominal: building.lccNominal,
      lccPV: building.lccPV,
    };

    const flows = buildSankeyFlows(sankeyItems);
    const lccScenarios = {
      current:  aggregateLCCScenario(lccItems),
      standard: aggregateLCCScenario(lccItems, false),
    };
    return { building, perCategory: rows, buildingSummary, flows, lccScenarios };
  }, [elements, areaElements, windowElements, lifecycleElements, buildingClass, t]);

  const groupedRows: Array<{ groupKey: 'structure' | 'envelope' | 'interior'; cats: typeof perCategory }> = [
    { groupKey: 'structure', cats: perCategory.filter((r) => GROUPS.structure.includes(r.cat)) },
    { groupKey: 'envelope', cats: perCategory.filter((r) => GROUPS.envelope.includes(r.cat)) },
    { groupKey: 'interior', cats: perCategory.filter((r) => GROUPS.interior.includes(r.cat)) },
  ];

  // Silence "building declared but unused" — the aggregate drives perCategory/flows
  // and buildingSummary above; expose it so future tweaks (e.g. a BCI banner) have
  // it at hand without re-walking the element arrays.
  void building;

  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
      <h2 className="mb-6 text-xl font-semibold">{t('nav.dashboard')}</h2>

      {/* 1. Per-category table (moved to top) */}
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t('dashboard.byCategory')}
      </h3>
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('dashboard.category')}</th>
              <th className="px-3 py-2 text-right">{t('summary.M')}</th>
              <th className="px-3 py-2 text-right">{t('summary.massMineral')}</th>
              <th className="px-3 py-2 text-right">{t('summary.massMetal')}</th>
              <th className="px-3 py-2 text-right">{t('summary.massGlass')}</th>
              <th className="px-3 py-2 text-right">{t('summary.massWood')}</th>
              <th className="px-3 py-2 text-right">{t('summary.massPlastic')}</th>
              <th className="px-3 py-2 text-right">{t('summary.massOther')}</th>
              <th className="px-3 py-2 text-right">MCIp</th>
              <th className="px-3 py-2 text-right">PCI</th>
              <th className="px-3 py-2 text-right">SCIp</th>
              <th className="px-3 py-2 text-right">{t('summary.baselineEC')}</th>
              <th className="px-3 py-2 text-right">{t('summary.designEC')}</th>
              <th className="px-3 py-2 text-right">{t('summary.reductionRatio')}</th>
              <th className="px-3 py-2 text-right">{t('summary.cost')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groupedRows.map(({ groupKey, cats }) => (
              <Fragment key={`g-${groupKey}`}>
                <tr className="bg-slate-50">
                  <td colSpan={15} className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t(GROUP_LABEL_KEY[groupKey])}
                  </td>
                </tr>
                {cats.map(({ cat, result }) => (
                  <tr key={cat}>
                    <td className="px-3 py-2 font-medium">{t(CATEGORY_LABEL_KEY[cat])}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(result.M)}</td>
                    {(['massMineral','massMetal','massGlass','massWood','massPlastic','massOther'] as const).map((k) => (
                      <td key={k} className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {result[k] > 0 ? fmtInt(result[k]) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(result.MCIp)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(result.PCI)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(result.SCIp)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(result.baselineEC)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(result.designEC)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPct(result.reductionRatio)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {result.cost > 0 ? fmtInt(result.cost) : '—'}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* 2. Analysis sections (mirror of category pages): material composition,
             circularity indices, embodied carbon, material-flow Sankey. */}
      <div className="mt-8">
        <AnalysisResults summary={buildingSummary} flows={flows} lccScenarios={lccScenarios} />
      </div>
    </section>
  );
}
