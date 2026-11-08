import { useEffect, useMemo, useRef, useState } from 'react';
import { useRowSelection, eventShiftKey } from '@/lib/useRowSelection';
import { useTranslation } from 'react-i18next';
import { useProject } from '@/store/project';
import { aggregateComponent, buildSankeyFlows, computeAreaElement } from '@/engine';
import type { CompositeTemplate } from '@/engine/composite';
import { fmtInt, fmtNum } from '@/lib/format';
import type { CompositeCategoryKey } from '@/templates/RC/compositeRegistry';
import { AreaImportDialog } from '@/components/AreaImportDialog';
import { AreaBatchBar } from '@/components/AreaBatchBar';
import { MaterialHeaders, MaterialRowCells } from '@/components/MaterialCells';
import { WasteHeaders, WasteRowCells } from '@/components/WasteCells';
import { LCCHeaders, LCCRowCells } from '@/components/LCCCells';
import { TableGroupHeaders } from '@/components/TableGroupHeaders';
import { AnalysisResults } from '@/components/AnalysisResults';
import { InputGuide, type GuideRow } from '@/components/InputGuide';
import type { AreaElement } from '@/engine/composite';

function TriStateCheckbox({
  checked, indeterminate, onChange,
}: { checked: boolean; indeterminate: boolean; onChange: (v: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />;
}

export function CompositeBody({
  category,
  template,
}: {
  category: CompositeCategoryKey;
  template: CompositeTemplate;
}) {
  const { t } = useTranslation();
  const elements = useProject((s) => s.areaElements[category]);
  const add = useProject((s) => s.addAreaElement);
  const upd = useProject((s) => s.updateAreaElement);
  const rm = useProject((s) => s.removeAreaElement);
  const rmMany = useProject((s) => s.removeAreaElements);
  const updMany = useProject((s) => s.updateAreaElements);
  const clearAll = useProject((s) => s.clearAreaElements);
  const consolidate = useProject((s) => s.consolidateAreaElements);
  const importRows = useProject((s) => s.importAreaElements);
  const [importOpen, setImportOpen] = useState(false);
  const {
    selected, toggleRow, toggleAll, clearSelection,
    allChecked, someChecked,
  } = useRowSelection(elements);

  const importConfig = useMemo(
    () => ({
      constructionNames: template.constructions.map((c) => c.name),
      defaults: template.elementDefaults,
    }),
    [template],
  );

  useEffect(() => { clearSelection(); }, [category, clearSelection]);

  const { perElement, summary, flows } = useMemo(() => {
    const perElement = elements.map((el) => {
      try {
        return { ok: true as const, result: computeAreaElement(el, template) };
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
    });
    const okPairs = elements
      .map((el, i) => ({ el, r: perElement[i] }))
      .filter((p): p is { el: AreaElement; r: { ok: true; result: ReturnType<typeof computeAreaElement> } } => p.r.ok);
    const flows = buildSankeyFlows(
      okPairs.map((p) => ({
        source: p.el.constructionType || '—',
        green: p.el.greenDemolition,
        hints: p.el.constructionType || '',
        isStructural: false,
        result: p.r.result,
      })),
    );
    return {
      perElement,
      summary: aggregateComponent(template.category, okPairs.map((p) => p.r.result)),
      flows,
    };
  }, [elements, template]);

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
  const applyPatch = (patch: Partial<AreaElement>) => {
    if (selected.size === 0) return;
    updMany(category, Array.from(selected), patch);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="mr-2 text-xl font-semibold">{t(`categoryLabels.${category}`)}</h2>
        <button type="button" onClick={() => setImportOpen(true)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {t('columns.import')}
        </button>
        <button type="button" onClick={() => add(category)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          {t('columns.addElement')}
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={handleConsolidate}
            disabled={elements.length < 2}
            title={t('columns.consolidateHintArea')}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {t('columns.consolidate')}
          </button>
          <button type="button" onClick={handleClearAll}
            disabled={elements.length === 0}
            className="rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50">
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

      <CompositeInputGuide />

      {selected.size > 0 && (
        <AreaBatchBar
          selectedCount={selected.size}
          constructionNames={template.constructions.map((c) => c.name)}
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
                        {template.constructions.map((c) => (
                          <option key={c.name} value={c.name}>{c.name}</option>
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
          <AnalysisResults summary={summary} flows={flows} />
        </div>
      )}
    </>
  );
}

function CompositeInputGuide() {
  const { t } = useTranslation();
  const rows: GuideRow[] = [
    { k: 'floor', label: t('columns.headers.floor'), effect: t('columns.guide.floor') },
    { k: 'family', label: t('columns.headers.family'), effect: t('columns.guide.family') },
    { k: 'areaM2', label: t('composite.headers.areaM2'), effect: t('composite.guide.areaM2') },
    { k: 'constructionType', label: t('composite.headers.constructionType'), effect: t('composite.guide.constructionType') },
    { k: 'materialBreakdown',
      label: t('columns.headers.massMineral') + ' / ' + t('columns.headers.massMetal') + ' / ' + t('columns.headers.massGlass') + ' / 其他',
      effect: t('columns.guide.materialBreakdown') },
    { k: 'reused', label: t('columns.headers.reused'), effect: t('columns.guide.reused') },
    { k: 'greenRecycled', label: t('composite.headers.greenRecycled'), effect: t('composite.guide.greenRecycled') },
    { k: 'prefabModular', label: t('columns.headers.prefabModular'), effect: t('columns.guide.prefabModular') },
    { k: 'mcipPci', label: 'MCIp / PCI / EC', effect: t('columns.guide.mcipPci') },
    { k: 'greenDemolition', label: t('columns.headers.greenDemolition'), effect: t('columns.guide.greenDemolition') },
  ];
  return <InputGuide rows={rows} />;
}
