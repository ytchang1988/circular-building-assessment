/**
 * Generic page body for interior walls (3-1) + floors (3-2). Both are
 * area-based, pick a construction type, and depend on project buildingClass
 * for lifecycle totals.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRowSelection, eventShiftKey } from '@/lib/useRowSelection';
import { useTranslation } from 'react-i18next';
import { useProject } from '@/store/project';
import {
  aggregateComponent,
  aggregateLCCScenario,
  buildFloorVariants,
  buildInteriorWallVariants,
  buildSankeyFlows,
  computeFloorElement,
  computeInteriorWallElement,
  type FloorElement,
  type InteriorWallElement,
  type LCCItem,
} from '@/engine';
import { VariantBreakdownPanel } from '@/components/VariantBreakdownPanel';
import {
  FLOORS_TEMPLATE,
  INTERIOR_WALLS_TEMPLATE,
  type LifecycleCategory,
} from '@/templates/RC/allRegistry';
import { fmtInt, fmtNum } from '@/lib/format';
import { AreaImportDialog } from '@/components/AreaImportDialog';
import { AreaBatchBar } from '@/components/AreaBatchBar';
import { MaterialHeaders, MaterialRowCells } from '@/components/MaterialCells';
import { WasteHeaders, WasteRowCells } from '@/components/WasteCells';
import { LCCHeaders, LCCRowCells } from '@/components/LCCCells';
import { TableGroupHeaders } from '@/components/TableGroupHeaders';
import { AnalysisResults } from '@/components/AnalysisResults';
import { InputGuide, type GuideRow } from '@/components/InputGuide';

function TriStateCheckbox({
  checked, indeterminate, onChange,
}: { checked: boolean; indeterminate: boolean; onChange: (v: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />;
}

type LifecycleEl = InteriorWallElement | FloorElement;

export function LifecycleBody({ category }: { category: LifecycleCategory }) {
  const { t } = useTranslation();
  const buildingClass = useProject((s) => s.meta.buildingClass);
  const elements = useProject((s) => s.lifecycleElements[category]) as LifecycleEl[];
  const add = useProject((s) => s.addLifecycleElement);
  const upd = useProject((s) => s.updateLifecycleElement);
  const rm = useProject((s) => s.removeLifecycleElement);
  const rmMany = useProject((s) => s.removeLifecycleElements);
  const updMany = useProject((s) => s.updateLifecycleElements);
  const clearAll = useProject((s) => s.clearLifecycleElements);
  const consolidate = useProject((s) => s.consolidateLifecycleElements);
  const importRows = useProject((s) => s.importLifecycleElements);
  const [importOpen, setImportOpen] = useState(false);
  const {
    selected, toggleRow, toggleAll, clearSelection,
    allChecked, someChecked,
  } = useRowSelection(elements);

  useEffect(() => { clearSelection(); }, [category, clearSelection]);

  const template = category === 'interiorWalls' ? INTERIOR_WALLS_TEMPLATE : FLOORS_TEMPLATE;

  const constructionNames = useMemo(
    () => template.constructions.map((c) => c.name),
    [template],
  );

  const importConfig = useMemo(
    () => ({
      constructionNames,
      defaults: template.elementDefaults,
    }),
    [constructionNames, template],
  );

  const buildingClasses = useMemo(() => {
    if (category === 'interiorWalls') {
      return INTERIOR_WALLS_TEMPLATE.buildingClasses.map((b) => b.name);
    }
    return FLOORS_TEMPLATE.buildingClasses;
  }, [category]);

  const { perElement, summary, flows, lccScenarios } = useMemo(() => {
    const perElement = elements.map((el) => {
      try {
        if (category === 'interiorWalls') {
          return { ok: true as const, result: computeInteriorWallElement(
            el as InteriorWallElement, INTERIOR_WALLS_TEMPLATE, buildingClass,
          ) };
        }
        return { ok: true as const, result: computeFloorElement(
          el as FloorElement, FLOORS_TEMPLATE, buildingClass,
        ) };
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
    });
    const okPairs = elements
      .map((el, i) => ({ el, r: perElement[i] }))
      .filter((p): p is { el: InteriorWallElement | FloorElement; r: { ok: true; result: ReturnType<typeof computeFloorElement> } } => p.r.ok);
    const flows = buildSankeyFlows(
      okPairs.map((p) => ({
        source: p.el.constructionType || '—',
        green: p.el.greenDemolition,
        hints: p.el.constructionType || '',
        isStructural: false,
        result: p.r.result,
      })),
    );
    const lccItems: LCCItem[] = okPairs.map((p) => ({
      green: p.el.greenDemolition,
      hints: p.el.constructionType || '',
      isStructural: false,
      layer: '內裝',
      mat: p.r.result,
    }));
    return {
      perElement,
      summary: aggregateComponent(template.category, okPairs.map((p) => p.r.result)),
      flows,
      lccScenarios: {
        current:  aggregateLCCScenario(lccItems),
        standard: aggregateLCCScenario(lccItems, false),
      },
    };
  }, [elements, buildingClass, category, template]);

  const handleClearAll = () => {
    if (elements.length === 0) return;
    if (window.confirm(t('columns.confirmClear', { count: elements.length }))) {
      clearAll(category);
      clearSelection();
    }
  };
  const handleConsolidate = () => {
    if (elements.length < 2) return;
    const { before, after } = consolidate(category);
    clearSelection();
    if (before === after) window.alert(t('columns.consolidateNone'));
    else window.alert(t('columns.consolidateDone', { before, after }));
  };
  const deleteSelected = () => {
    if (selected.size === 0) return;
    rmMany(category, Array.from(selected));
    clearSelection();
  };
  const applyPatch = (patch: Partial<InteriorWallElement | FloorElement>) => {
    if (selected.size === 0) return;
    updMany(category, Array.from(selected), patch);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="mr-2 text-xl font-semibold">
          {t(`categoryLabels.${category}`)}
        </h2>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t('columns.import')}
        </button>
        <button
          type="button"
          onClick={() => add(category)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {t('columns.addElement')}
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={handleConsolidate}
            disabled={elements.length < 2}
            title={t('columns.consolidateHintArea')}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {t('columns.consolidate')}
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={elements.length === 0}
            className="rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            {t('columns.clearAll')}
          </button>
        </div>
      </div>

      <AreaImportDialog
        open={importOpen}
        config={importConfig}
        onClose={() => setImportOpen(false)}
        onImport={(res, mode) =>
          importRows(
            category,
            res.rows.map((r) => ({ ...r.element, greenDemolition: false })),
            mode,
          )
        }
      />

      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        <span className="font-medium">{t('project.buildingClass')}:</span>{' '}
        {buildingClass || t('project.notSet')} —{' '}
        <span className="text-amber-700">{t('lifecycle.buildingClassHint')}</span>
        {!buildingClasses.includes(buildingClass) && (
          <span className="ml-2 font-semibold text-rose-700">
            {t('lifecycle.classMismatch')}
          </span>
        )}
      </div>

      <LifecycleInputGuide />

      <VariantBreakdownPanel
        variants={useMemo(
          () =>
            category === 'interiorWalls'
              ? buildInteriorWallVariants(elements as InteriorWallElement[], INTERIOR_WALLS_TEMPLATE, buildingClass, {
                  reusedTag: t('variantBreakdown.labels.reused'),
                  greenTag: t('variantBreakdown.labels.green'),
                  prefabTag: t('variantBreakdown.labels.prefab'),
                  constructionLabel: t('variantBreakdown.labels.construction'),
                })
              : buildFloorVariants(elements as FloorElement[], FLOORS_TEMPLATE, buildingClass, {
                  reusedTag: t('variantBreakdown.labels.reused'),
                  prefabTag: t('variantBreakdown.labels.prefab'),
                  constructionLabel: t('variantBreakdown.labels.construction'),
                }),
          [elements, category, buildingClass, t],
        )}
      />

      {selected.size > 0 && (
        <AreaBatchBar
          selectedCount={selected.size}
          constructionNames={constructionNames}
          onApplyConstruction={(v) => applyPatch({ constructionType: v })}
          onApplyReused={(v) => applyPatch({ reused: v })}
          onApplyGreenRecycled={(v) => applyPatch({ greenRecycled: v })}
          onApplyModular={(v) => applyPatch({ prefabModular: v })}
          onApplyGreenDemolition={(v) => applyPatch({ greenDemolition: v })}
          onDelete={deleteSelected}
          onClearSelection={clearSelection}
        />
      )}

      {elements.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">{t('columns.empty')}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <TableGroupHeaders basicCols={5} circularityCols={6} />
              <tr>
                <th className="px-3 py-2">
                  <TriStateCheckbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2">{t('columns.headers.floor')}</th>
                <th className="px-3 py-2">{t('columns.headers.family')}</th>
                <th className="px-3 py-2">{t('composite.headers.areaM2')}</th>
                <th className="px-3 py-2">{t('composite.headers.constructionType')}</th>
                <MaterialHeaders />
                <th className="px-3 py-2">{t('columns.headers.reused')}</th>
                <th className="px-3 py-2">{t('composite.headers.greenRecycled')}</th>
                <th className="px-3 py-2">{t('columns.headers.prefabModular')}</th>
                <th className="px-3 py-2 text-right">MCIp</th>
                <th className="px-3 py-2 text-right">PCI</th>
                <th className="px-3 py-2 text-right">EC kgCO₂eq</th>
                <th className="px-3 py-2 text-center">{t('columns.headers.greenDemolition')}</th>
                <WasteHeaders />
                <LCCHeaders />
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {elements.map((el, idx) => {
                const r = perElement[idx];
                const isSelected = selected.has(el.id);
                return (
                  <tr key={el.id} className={isSelected ? 'bg-slate-50' : undefined}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={isSelected}
                        onChange={(e) => toggleRow(idx, eventShiftKey(e))}
                        aria-label={t('columns.selectRow')}
                        title={t('columns.selectRowHint')} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={el.floor ?? ''}
                        onChange={(e) => upd(category, el.id, { floor: e.target.value })}
                        className="w-20 rounded border border-slate-200 px-2 py-1" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={el.family ?? ''}
                        onChange={(e) => upd(category, el.id, { family: e.target.value })}
                        className="w-44 rounded border border-slate-200 px-2 py-1" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} step="any" value={el.areaM2}
                        onChange={(e) => upd(category, el.id, { areaM2: Number(e.target.value) || 0 })}
                        className="w-24 rounded border border-slate-200 px-2 py-1 text-right" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={el.constructionType}
                        onChange={(e) => upd(category, el.id, { constructionType: e.target.value })}
                        className="w-80 rounded border border-slate-200 px-2 py-1">
                        {constructionNames.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </td>
                    <MaterialRowCells r={r.ok ? r.result : null} />
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={el.reused}
                        onChange={(e) => upd(category, el.id, { reused: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={el.greenRecycled}
                        onChange={(e) => upd(category, el.id, { greenRecycled: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={el.prefabModular}
                        onChange={(e) => upd(category, el.id, { prefabModular: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ok ? fmtNum(r.result.MCIp) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ok ? fmtNum(r.result.PCI) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ok ? fmtInt(r.result.designEC) : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={el.greenDemolition}
                        onChange={(e) => upd(category, el.id, { greenDemolition: e.target.checked })} />
                    </td>
                    <WasteRowCells r={r.ok ? r.result : null} />
                    <LCCRowCells r={r.ok ? r.result : null} />
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => rm(category, el.id)}
                        className="text-xs text-rose-600 hover:underline">
                        {t('columns.removeElement')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {elements.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('columns.analysisResults')}
          </h3>
          <AnalysisResults summary={summary} flows={flows} lccScenarios={lccScenarios} />
        </div>
      )}
    </>
  );
}

function LifecycleInputGuide() {
  const { t } = useTranslation();
  const rows: GuideRow[] = [
    { k: 'buildingClass', label: t('project.buildingClass'), effect: t('lifecycle.guide.buildingClass') },
    { k: 'floor', label: t('columns.headers.floor'), effect: t('columns.guide.floor') },
    { k: 'family', label: t('columns.headers.family'), effect: t('columns.guide.family') },
    { k: 'areaM2', label: t('composite.headers.areaM2'), effect: t('lifecycle.guide.areaM2') },
    { k: 'constructionType', label: t('composite.headers.constructionType'), effect: t('lifecycle.guide.constructionType') },
    { k: 'materialBreakdown',
      label: t('columns.headers.massMineral') + ' / ' + t('columns.headers.massMetal') + ' / 其他',
      effect: t('columns.guide.materialBreakdown') },
    { k: 'reused', label: t('columns.headers.reused'), effect: t('columns.guide.reused') },
    { k: 'greenRecycled', label: t('composite.headers.greenRecycled'), effect: t('lifecycle.guide.greenRecycled') },
    { k: 'prefabModular', label: t('columns.headers.prefabModular'), effect: t('columns.guide.prefabModular') },
    { k: 'mcipPci', label: 'MCIp / PCI / EC', effect: t('columns.guide.mcipPci') },
    { k: 'greenDemolition', label: t('columns.headers.greenDemolition'), effect: t('columns.guide.greenDemolition') },
  ];
  return <InputGuide rows={rows} />;
}
