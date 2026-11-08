import { useTranslation } from 'react-i18next';
import { fmtInt } from '@/lib/format';
import type { ElementResult } from '@/engine/types';

const KEYS = [
  'massMineral', 'massMetal', 'massGlass', 'massWood', 'massPlastic', 'massOther',
] as const;

/** Six <th> cells for the material breakdown, inserted before reused/flag columns. */
export function MaterialHeaders() {
  const { t } = useTranslation();
  return (
    <>
      {KEYS.map((k) => (
        <th key={k} className="px-3 py-2 text-right">{t(`columns.headers.${k}`)}</th>
      ))}
    </>
  );
}

/** Six <td> cells rendering the per-element material split (read-only). */
export function MaterialRowCells({ r }: { r: ElementResult | null }) {
  return (
    <>
      {KEYS.map((k) => (
        <td key={k} className="px-3 py-2 text-right tabular-nums text-slate-600">
          {r ? (r[k] > 0 ? fmtInt(r[k]) : '—') : '—'}
        </td>
      ))}
    </>
  );
}

/** Six summary pills for the analysis-result card. Call as array items. */
export function materialSummaryItems(
  summary: {
    massMineral: number; massMetal: number; massGlass: number;
    massWood: number; massPlastic: number; massOther: number;
  },
  t: (k: string) => string,
): Array<[string, string]> {
  return KEYS.map((k) => [t(`summary.${k}`), fmtInt(summary[k])]);
}
