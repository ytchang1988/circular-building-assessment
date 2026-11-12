import { useEffect, useMemo, useRef, useState } from 'react';
import { useRowSelection, eventShiftKey } from '@/lib/useRowSelection';
import { useTranslation } from 'react-i18next';
import { useProject } from '@/store/project';
import {
  aggregateComponent,
  aggregateLCCScenario,
  buildSankeyFlows,
  buildWindowVariants,
  computeWindowElement,
  type LCCItem,
} from '@/engine';
import { VariantBreakdownPanel } from '@/components/VariantBreakdownPanel';
import type { WindowElement } from '@/engine/windows';
import { WINDOWS_TEMPLATE } from '@/templates/RC/allRegistry';
import { fmtInt, fmtNum } from '@/lib/format';
import { WindowImportDialog } from '@/components/WindowImportDialog';
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

export function WindowsBody() {
  const { t } = useTranslation();
  const elements = useProject((s) => s.windowElements);
  const add = useProject((s) => s.addWindowElement);
  const upd = useProject((s) => s.updateWindowElement);
  const rm = useProject((s) => s.removeWindowElement);
  const rmMany = useProject((s) => s.removeWindowElements);
  const updMany = useProject((s) => s.updateWindowElements);
  const clearAll = useProject((s) => s.clearWindowElements);
  const consolidate = useProject((s) => s.consolidateWindowElements);
  const importRows = useProject((s) => s.importWindowElements);
  const [importOpen, setImportOpen] = useState(false);
  const {
    selected, toggleRow, toggleAll, clearSelection,
    allChecked, someChecked,
  } = useRowSelection(elements);

  const importConfig = useMemo(
    () => ({
      glasses: WINDOWS_TEMPLATE.glasses,
      frames: WINDOWS_TEMPLATE.frames,
      defaults: WINDOWS_TEMPLATE.elementDefaults,
    }),
    [],
  );

  const { perElement, summary, flows, lccScenarios } = useMemo(() => {
    const perElement = elements.map((el) => {
      try {
        return { ok: true as const, result: computeWindowElement(el, WINDOWS_TEMPLATE) };
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
    });
    const okPairs = elements
      .map((el, i) => ({ el, r: perElement[i] }))
      .filter((p): p is { el: WindowElement; r: { ok: true; result: ReturnType<typeof computeWindowElement> } } => p.r.ok);
    const flows = buildSankeyFlows(
      okPairs.map((p) => ({
        source: p.el.frame || '—',
        green: p.el.greenDemolition,
        hints: p.el.frame || '',
        isStructural: false,
        result: p.r.result,
      })),
    );
    const lccItems: LCCItem[] = okPairs.map((p) => ({
      green: p.el.greenDemolition,
      hints: p.el.frame || '',
      isStructural: false,
      layer: '外裝',
      mat: p.r.result,
    }));
    return {
      perElement,
      summary: aggregateComponent(WINDOWS_TEMPLATE.category, okPairs.map((p) => p.r.result)),
      flows,
      lccScenarios: {
        current:  aggregateLCCScenario(lccItems),
        standard: aggregateLCCScenario(lccItems, false),
      },
    };
  }, [elements]);

  const handleClearAll = () => {
    if (elements.length === 0) return;
    if (window.confirm(t('columns.confirmClear', { count: elements.length }))) {
      clearAll();
      clearSelection();
    }
  };
  const handleConsolidate = () => {
    if (elements.length < 2) return;
    const { before, after } = consolidate();
    clearSelection();
    if (before === after) window.alert(t('columns.consolidateNone'));
    else window.alert(t('columns.consolidateDone', { before, after }));
  };
  const deleteSelected = () => {
    if (selected.size === 0) return;
    rmMany(Array.from(selected));
    clearSelection();
  };
  const applyPatch = (patch: Partial<WindowElement>) => {
    if (selected.size === 0) return;
    updMany(Array.from(selected), patch);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="mr-2 text-xl font-semibold">{t('categoryLabels.windows')}</h2>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t('columns.import')}
        </button>
        <button
          type="button"
          onClick={add}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {t('columns.addElement')}
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={handleConsolidate}
            disabled={elements.length < 2}
            title={t('columns.consolidateHintWindow')}
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

      <WindowImportDialog
        open={importOpen}
        config={importConfig}
        onClose={() => setImportOpen(false)}
        onImport={(res, mode) =>
          importRows(
            res.rows.map((r) => ({ ...r.element, greenDemolition: false })),
            mode,
          )
        }
      />

      <WindowsInputGuide />

      <VariantBreakdownPanel
        variants={useMemo(
          () => buildWindowVariants(elements, WINDOWS_TEMPLATE, {
            glass: t('variantBreakdown.labels.glass'),
            frame: t('variantBreakdown.labels.frame'),
            reusedTag: t('variantBreakdown.labels.reused'),
            prefabTag: t('variantBreakdown.labels.prefab'),
          }),
          [elements, t],
        )}
      />

      {selected.size > 0 && (
        <WindowBatchBar
          selectedCount={selected.size}
          glasses={WINDOWS_TEMPLATE.glasses}
          frames={WINDOWS_TEMPLATE.frames}
          onApplyGlass={(v) => applyPatch({ glass: v })}
          onApplyFrame={(v) => applyPatch({ frame: v })}
          onApplyReused={(v) => applyPatch({ reused: v })}
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
              <TableGroupHeaders basicCols={6} circularityCols={5} />
              <tr>
                <th className="px-3 py-2">
                  <TriStateCheckbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2">{t('columns.headers.floor')}</th>
                <th className="px-3 py-2">{t('columns.headers.family')}</th>
                <th className="px-3 py-2">{t('composite.headers.areaM2')}</th>
                <th className="px-3 py-2">{t('windows.headers.glass')}</th>
                <th className="px-3 py-2">{t('windows.headers.frame')}</th>
                <MaterialHeaders />
                <th className="px-3 py-2">{t('columns.headers.reused')}</th>
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
                        onChange={(e) => upd(el.id, { floor: e.target.value })}
                        className="w-20 rounded border border-slate-200 px-2 py-1" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={el.family ?? ''}
                        onChange={(e) => upd(el.id, { family: e.target.value })}
                        className="w-44 rounded border border-slate-200 px-2 py-1" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} step="any" value={el.areaM2}
                        onChange={(e) => upd(el.id, { areaM2: Number(e.target.value) || 0 })}
                        className="w-24 rounded border border-slate-200 px-2 py-1 text-right" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={el.glass}
                        onChange={(e) => upd(el.id, { glass: e.target.value })}
                        className="w-56 rounded border border-slate-200 px-2 py-1">
                        {WINDOWS_TEMPLATE.glasses.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select value={el.frame}
                        onChange={(e) => upd(el.id, { frame: e.target.value })}
                        className="w-48 rounded border border-slate-200 px-2 py-1">
                        {WINDOWS_TEMPLATE.frames.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </td>
                    <MaterialRowCells r={r.ok ? r.result : null} />
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={el.reused}
                        onChange={(e) => upd(el.id, { reused: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={el.prefabModular}
                        onChange={(e) => upd(el.id, { prefabModular: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ok ? fmtNum(r.result.MCIp) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ok ? fmtNum(r.result.PCI) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ok ? fmtInt(r.result.designEC) : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={el.greenDemolition}
                        onChange={(e) => upd(el.id, { greenDemolition: e.target.checked })} />
                    </td>
                    <WasteRowCells r={r.ok ? r.result : null} />
                    <LCCRowCells r={r.ok ? r.result : null} />
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => rm(el.id)}
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

function WindowBatchBar({
  selectedCount, glasses, frames,
  onApplyGlass, onApplyFrame, onApplyReused, onApplyModular,
  onApplyGreenDemolition,
  onDelete, onClearSelection,
}: {
  selectedCount: number;
  glasses: string[];
  frames: string[];
  onApplyGlass: (v: string) => void;
  onApplyFrame: (v: string) => void;
  onApplyReused: (v: boolean) => void;
  onApplyModular: (v: boolean) => void;
  onApplyGreenDemolition: (v: boolean) => void;
  onDelete: () => void;
  onClearSelection: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-slate-300 bg-slate-100 px-4 py-2 text-sm">
      <span className="font-medium text-slate-700">
        {t('columns.batch.selected', { count: selectedCount })}
      </span>
      <div className="h-5 w-px bg-slate-300" />
      <label className="flex items-center gap-1 text-slate-700">
        <span className="text-xs">{t('windows.headers.glass')}:</span>
        <select defaultValue=""
          onChange={(e) => {
            if (e.target.value) { onApplyGlass(e.target.value); e.target.value = ''; }
          }}
          className="max-w-[14rem] rounded border border-slate-300 bg-white px-2 py-1 text-xs">
          <option value="" disabled>{t('columns.batch.applyTo')}</option>
          {glasses.map((g) => (<option key={g} value={g}>{g}</option>))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-slate-700">
        <span className="text-xs">{t('windows.headers.frame')}:</span>
        <select defaultValue=""
          onChange={(e) => {
            if (e.target.value) { onApplyFrame(e.target.value); e.target.value = ''; }
          }}
          className="max-w-[12rem] rounded border border-slate-300 bg-white px-2 py-1 text-xs">
          <option value="" disabled>{t('columns.batch.applyTo')}</option>
          {frames.map((f) => (<option key={f} value={f}>{f}</option>))}
        </select>
      </label>
      <WinToggleGroup label={t('columns.headers.reused')}
        onYes={() => onApplyReused(true)} onNo={() => onApplyReused(false)} />
      <WinToggleGroup label={t('columns.headers.prefabModular')}
        onYes={() => onApplyModular(true)} onNo={() => onApplyModular(false)} />
      <WinToggleGroup label={t('columns.headers.greenDemolition')}
        onYes={() => onApplyGreenDemolition(true)} onNo={() => onApplyGreenDemolition(false)} />
      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onDelete}
          className="rounded-md border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50">
          {t('columns.batch.delete')}
        </button>
        <button type="button" onClick={onClearSelection}
          className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-200">
          {t('columns.batch.clear')}
        </button>
      </div>
    </div>
  );
}

function WinToggleGroup({ label, onYes, onNo }: {
  label: string; onYes: () => void; onNo: () => void;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1 text-slate-700">
      <span className="text-xs">{label}:</span>
      <button type="button" onClick={onYes}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
        {t('columns.yes')}
      </button>
      <button type="button" onClick={onNo}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
        {t('columns.no')}
      </button>
    </span>
  );
}


function WindowsInputGuide() {
  const { t } = useTranslation();
  const rows: GuideRow[] = [
    { k: 'floor', label: t('columns.headers.floor'), effect: t('columns.guide.floor') },
    { k: 'family', label: t('columns.headers.family'), effect: t('columns.guide.family') },
    { k: 'areaM2', label: t('composite.headers.areaM2'), effect: t('windows.guide.areaM2') },
    { k: 'glass', label: t('windows.headers.glass'), effect: t('windows.guide.glass') },
    { k: 'frame', label: t('windows.headers.frame'), effect: t('windows.guide.frame') },
    { k: 'materialBreakdown',
      label: t('columns.headers.massGlass') + ' / ' + t('columns.headers.massMetal'),
      effect: t('columns.guide.materialBreakdown') },
    { k: 'reused', label: t('columns.headers.reused'), effect: t('columns.guide.reused') },
    { k: 'prefabModular', label: t('columns.headers.prefabModular'), effect: t('columns.guide.prefabModular') },
    { k: 'mcipPci', label: 'MCIp / PCI / EC', effect: t('columns.guide.mcipPci') },
    { k: 'greenDemolition', label: t('columns.headers.greenDemolition'), effect: t('columns.guide.greenDemolition') },
  ];
  return <InputGuide rows={rows} />;
}
