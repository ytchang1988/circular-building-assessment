import { useEffect, useMemo, useRef, useState } from 'react';
import { useRowSelection, eventShiftKey } from '@/lib/useRowSelection';
import { useTranslation } from 'react-i18next';
import { useProject } from '@/store/project';
import {
  aggregateComponent,
  aggregateLCCScenario,
  buildSankeyFlows,
  computeColumnElement,
  type LCCItem,
  type RCColumnsTemplate,
} from '@/engine';
import { fmtInt, fmtNum } from '@/lib/format';
import { ImportDialog } from '@/components/ImportDialog';
import type { ColumnElement } from '@/engine/types';
import type { RCMonoCategory } from '@/templates/RC/allRegistry';
import { MaterialHeaders, MaterialRowCells } from '@/components/MaterialCells';
import { WasteHeaders, WasteRowCells } from '@/components/WasteCells';
import { LCCHeaders, LCCRowCells } from '@/components/LCCCells';
import { TableGroupHeaders } from '@/components/TableGroupHeaders';
import { AnalysisResults } from '@/components/AnalysisResults';
import { InputGuide, type GuideRow } from '@/components/InputGuide';

function TriStateCheckbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={ariaLabel}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

export function RCElementsBody({
  category,
  template,
}: {
  category: RCMonoCategory;
  template: RCColumnsTemplate;
}) {
  const { t } = useTranslation();
  const elements = useProject((s) => s.elements[category]);
  const addElement = useProject((s) => s.addElement);
  const updateElement = useProject((s) => s.updateElement);
  const removeElement = useProject((s) => s.removeElement);
  const removeElements = useProject((s) => s.removeElements);
  const updateElements = useProject((s) => s.updateElements);
  const clearElements = useProject((s) => s.clearElements);
  const consolidateElements = useProject((s) => s.consolidateElements);
  const importElements = useProject((s) => s.importElements);
  const [importOpen, setImportOpen] = useState(false);
  const {
    selected, toggleRow, toggleAll, clearSelection,
    allChecked, someChecked,
  } = useRowSelection(elements);

  useEffect(() => { clearSelection(); }, [category, clearSelection]);

  const uniqueStrengths = useMemo(
    () => Array.from(new Set(template.concreteMaterials.map((m) => m.strength))),
    [template],
  );
  const uniqueAdmixtures = useMemo(
    () =>
      Array.from(new Set(template.concreteMaterials.map((m) => m.admixturePct)))
        .sort((a, b) => a - b),
    [template],
  );

  const { perElement, summary, flows, lccScenarios } = useMemo(() => {
    const perElement = elements.map((el) => {
      try {
        return { ok: true as const, result: computeColumnElement(el, template) };
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
    });
    const okWithEl = elements
      .map((el, i) => ({ el, r: perElement[i] }))
      .filter((p): p is { el: ColumnElement; r: { ok: true; result: ReturnType<typeof computeColumnElement> } } => p.r.ok);
    const sourceLabel = t(`categoryLabels.${category}`);
    const flows = buildSankeyFlows(
      okWithEl.map((p) => ({
        source: sourceLabel,
        green: p.el.greenDemolition,
        hints: '鋼筋',
        isStructural: true,
        result: p.r.result,
      })),
    );
    const lccItems: LCCItem[] = okWithEl.map((p) => ({
      green: p.el.greenDemolition,
      hints: '鋼筋',
      isStructural: true,
      layer: '結構',
      mat: p.r.result,
    }));
    return {
      perElement,
      summary: aggregateComponent(template.category, okWithEl.map((p) => p.r.result)),
      flows,
      lccScenarios: {
        current:  aggregateLCCScenario(lccItems),
        standard: aggregateLCCScenario(lccItems, false),
      },
    };
  }, [elements, template, category, t]);

  const handleClearAll = () => {
    if (elements.length === 0) return;
    if (window.confirm(t('columns.confirmClear', { count: elements.length }))) {
      clearElements(category);
      clearSelection();
    }
  };
  const handleConsolidate = () => {
    if (elements.length < 2) return;
    const { before, after } = consolidateElements(category);
    clearSelection();
    if (before === after) window.alert(t('columns.consolidateNone'));
    else window.alert(t('columns.consolidateDone', { before, after }));
  };
  const applyPatch = (patch: Partial<ColumnElement>) => {
    if (selected.size === 0) return;
    updateElements(category, Array.from(selected), patch);
  };
  const deleteSelected = () => {
    if (selected.size === 0) return;
    removeElements(category, Array.from(selected));
    clearSelection();
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="mr-2 text-xl font-semibold">
          {t(`categoryLabels.${category}`)}
        </h2>
        <button type="button" onClick={() => setImportOpen(true)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {t('columns.import')}
        </button>
        <button type="button" onClick={() => addElement(category)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          {t('columns.addElement')}
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={handleConsolidate}
            disabled={elements.length < 2}
            title={t('columns.consolidateHint')}
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

      <ImportDialog
        open={importOpen}
        template={template}
        onClose={() => setImportOpen(false)}
        onImport={(res, mode) =>
          importElements(
            category,
            res.rows.map((r) => ({ ...r.element, greenDemolition: false })),
            mode,
          )
        }
      />

      <RCInputGuide />

      {selected.size > 0 && (
        <BatchActionBar
          selectedCount={selected.size}
          strengths={uniqueStrengths}
          admixtures={uniqueAdmixtures}
          onApplyStrength={(v) => applyPatch({ concreteStrength: v })}
          onApplyAdmixture={(v) => applyPatch({ admixturePct: v })}
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
                  <TriStateCheckbox
                    checked={allChecked} indeterminate={someChecked}
                    onChange={toggleAll} ariaLabel={t('columns.selectAll')}
                  />
                </th>
                <th className="px-3 py-2">{t('columns.headers.floor')}</th>
                <th className="px-3 py-2">{t('columns.headers.family')}</th>
                <th className="px-3 py-2">{t('columns.headers.volumeM3')}</th>
                <th className="px-3 py-2">{t('columns.headers.concreteStrength')}</th>
                <th className="px-3 py-2">{t('columns.headers.admixturePct')}</th>
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
                        onChange={(e) => updateElement(category, el.id, { floor: e.target.value })}
                        className="w-20 rounded border border-slate-200 px-2 py-1" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <input type="text" value={el.family ?? ''}
                          onChange={(e) => updateElement(category, el.id, { family: e.target.value })}
                          className="w-44 rounded border border-slate-200 px-2 py-1" />
                        {el.note && (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                            {el.note}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} step="any" value={el.volumeM3}
                        onChange={(e) => updateElement(category, el.id, { volumeM3: Number(e.target.value) || 0 })}
                        className="w-24 rounded border border-slate-200 px-2 py-1 text-right" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={el.concreteStrength}
                        onChange={(e) => updateElement(category, el.id, { concreteStrength: e.target.value })}
                        className="w-64 rounded border border-slate-200 px-2 py-1">
                        {uniqueStrengths.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select value={el.admixturePct}
                        onChange={(e) => updateElement(category, el.id, { admixturePct: Number(e.target.value) })}
                        className="rounded border border-slate-200 px-2 py-1">
                        {uniqueAdmixtures.map((p) => (
                          <option key={p} value={p}>{`${(p * 100).toFixed(0)}%`}</option>
                        ))}
                      </select>
                    </td>
                    <MaterialRowCells r={r.ok ? r.result : null} />
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={el.reused}
                        onChange={(e) => updateElement(category, el.id, { reused: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={el.prefabModular}
                        onChange={(e) => updateElement(category, el.id, { prefabModular: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ok ? fmtNum(r.result.MCIp) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ok ? fmtNum(r.result.PCI) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ok ? fmtInt(r.result.designEC) : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={el.greenDemolition}
                        onChange={(e) => updateElement(category, el.id, { greenDemolition: e.target.checked })} />
                    </td>
                    <WasteRowCells r={r.ok ? r.result : null} />
                    <LCCRowCells r={r.ok ? r.result : null} />
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => removeElement(category, el.id)}
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

function RCInputGuide() {
  const { t } = useTranslation();
  const rows: GuideRow[] = [
    { k: 'floor', label: t('columns.headers.floor'), effect: t('columns.guide.floor') },
    { k: 'family', label: t('columns.headers.family'), effect: t('columns.guide.family') },
    { k: 'volume', label: t('columns.headers.volumeM3'), effect: t('columns.guide.volume') },
    { k: 'concreteStrength', label: t('columns.headers.concreteStrength'), effect: t('columns.guide.concreteStrength') },
    { k: 'admixturePct', label: t('columns.headers.admixturePct'), effect: t('columns.guide.admixturePct') },
    { k: 'massMineral', label: t('columns.headers.massMineral'), effect: t('columns.guide.massMineral') },
    { k: 'massMetal', label: t('columns.headers.massMetal'), effect: t('columns.guide.massMetal') },
    { k: 'materialBreakdown', label: t('columns.headers.massGlass') + '/' + t('columns.headers.massWood') + '/' + t('columns.headers.massPlastic') + '/' + t('columns.headers.massOther'), effect: t('columns.guide.materialBreakdown') },
    { k: 'reused', label: t('columns.headers.reused'), effect: t('columns.guide.reused') },
    { k: 'prefabModular', label: t('columns.headers.prefabModular'), effect: t('columns.guide.prefabModular') },
    { k: 'greenDemolition', label: t('columns.headers.greenDemolition'), effect: t('columns.guide.greenDemolition') },
  ];
  return <InputGuide rows={rows} />;
}

function BatchActionBar({
  selectedCount, strengths, admixtures,
  onApplyStrength, onApplyAdmixture, onApplyReused, onApplyModular,
  onApplyGreenDemolition,
  onDelete, onClearSelection,
}: {
  selectedCount: number;
  strengths: string[];
  admixtures: number[];
  onApplyStrength: (v: string) => void;
  onApplyAdmixture: (v: number) => void;
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
        <span className="text-xs">{t('columns.headers.concreteStrength')}:</span>
        <select defaultValue=""
          onChange={(e) => {
            if (e.target.value) { onApplyStrength(e.target.value); e.target.value = ''; }
          }}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
          <option value="" disabled>{t('columns.batch.applyTo')}</option>
          {strengths.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-slate-700">
        <span className="text-xs">{t('columns.headers.admixturePct')}:</span>
        <select defaultValue=""
          onChange={(e) => {
            if (e.target.value !== '') { onApplyAdmixture(Number(e.target.value)); e.target.value = ''; }
          }}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
          <option value="" disabled>{t('columns.batch.applyTo')}</option>
          {admixtures.map((p) => (<option key={p} value={p}>{`${(p * 100).toFixed(0)}%`}</option>))}
        </select>
      </label>
      <ToggleGroup label={t('columns.headers.reused')}
        onYes={() => onApplyReused(true)} onNo={() => onApplyReused(false)} />
      <ToggleGroup label={t('columns.headers.prefabModular')}
        onYes={() => onApplyModular(true)} onNo={() => onApplyModular(false)} />
      <ToggleGroup label={t('columns.headers.greenDemolition')}
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

function ToggleGroup({ label, onYes, onNo }: {
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

