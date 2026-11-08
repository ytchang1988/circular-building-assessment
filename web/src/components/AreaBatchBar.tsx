import { useTranslation } from 'react-i18next';

interface Props {
  selectedCount: number;
  constructionNames: string[];
  onApplyConstruction: (v: string) => void;
  onApplyReused: (v: boolean) => void;
  onApplyGreenRecycled: (v: boolean) => void;
  onApplyModular: (v: boolean) => void;
  onApplyGreenDemolition: (v: boolean) => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

/** Batch-action bar shared by cladding / interior walls / floors. */
export function AreaBatchBar({
  selectedCount, constructionNames,
  onApplyConstruction, onApplyReused, onApplyGreenRecycled, onApplyModular,
  onApplyGreenDemolition,
  onDelete, onClearSelection,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-slate-300 bg-slate-100 px-4 py-2 text-sm">
      <span className="font-medium text-slate-700">
        {t('columns.batch.selected', { count: selectedCount })}
      </span>
      <div className="h-5 w-px bg-slate-300" />
      <label className="flex items-center gap-1 text-slate-700">
        <span className="text-xs">{t('composite.headers.constructionType')}:</span>
        <select defaultValue=""
          onChange={(e) => {
            if (e.target.value) { onApplyConstruction(e.target.value); e.target.value = ''; }
          }}
          className="max-w-[16rem] rounded border border-slate-300 bg-white px-2 py-1 text-xs">
          <option value="" disabled>{t('columns.batch.applyTo')}</option>
          {constructionNames.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <ToggleGroup label={t('columns.headers.reused')}
        onYes={() => onApplyReused(true)} onNo={() => onApplyReused(false)} />
      <ToggleGroup label={t('composite.headers.greenRecycled')}
        onYes={() => onApplyGreenRecycled(true)} onNo={() => onApplyGreenRecycled(false)} />
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
