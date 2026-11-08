import { useTranslation } from 'react-i18next';

export interface GuideRow {
  k: string;
  label: string;
  effect: string;
}

/**
 * Collapsible "輸入欄位說明" panel used by every category body page.
 * Callers pass rows pre-rendered through their own i18n namespace (RC uses
 * `columns.guide.*`, cladding uses `composite.guide.*`, etc.).
 */
export function InputGuide({ rows, defaultOpen = true }: { rows: GuideRow[]; defaultOpen?: boolean }) {
  const { t } = useTranslation();
  return (
    <details
      className="mb-4 rounded-md border border-slate-200 bg-white"
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-slate-700">
        {t('columns.guide.title')}
      </summary>
      <div className="border-t border-slate-200 px-4 py-3">
        <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          {rows.map(({ k, label, effect }) => (
            <div key={k} className="flex gap-2">
              <dt className="min-w-[8rem] font-medium text-slate-700">{label}</dt>
              <dd className="text-slate-600">{effect}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
