import { useTranslation } from 'react-i18next';
import { fmtInt } from '@/lib/format';
import type { ElementResult } from '@/engine/types';

const KEYS = [
  'wasteB5',
  'wasteR1301', 'wasteR1304',
  'wasteR0401', 'wasteR0701',
  'wasteR0201', 'wasteR0503',
] as const;

/** Short codes shown in the table header (full name goes in the title/tooltip). */
const CODE_LABEL: Record<(typeof KEYS)[number], { code: string; name: string }> = {
  wasteB5:     { code: 'B5',     name: '廢土方' },
  wasteR1301:  { code: 'R-1301', name: '廢鐵' },
  wasteR1304:  { code: 'R-1304', name: '廢鋁' },
  wasteR0401:  { code: 'R-0401', name: '廢玻璃' },
  wasteR0701:  { code: 'R-0701', name: '廢木材' },
  wasteR0201:  { code: 'R-0201', name: '廢塑膠' },
  wasteR0503:  { code: 'R-0503', name: '營建混合物' },
};

/** 8 <th> cells for the waste breakdown, placed after the 綠色拆除 checkbox. */
export function WasteHeaders() {
  const { t } = useTranslation();
  return (
    <>
      {KEYS.map((k) => {
        const { code, name } = CODE_LABEL[k];
        const localized = t(`waste.${k}`, { defaultValue: name });
        return (
          <th
            key={k}
            className="px-2 py-2 text-right"
            title={`${code} ${localized}`}
          >
            <div className="font-semibold">{code}</div>
            <div className="text-[10px] font-normal text-slate-400">{localized}</div>
          </th>
        );
      })}
    </>
  );
}

/** 8 <td> cells rendering the per-element waste breakdown (read-only). */
export function WasteRowCells({ r }: { r: ElementResult | null }) {
  return (
    <>
      {KEYS.map((k) => (
        <td key={k} className="px-2 py-2 text-right tabular-nums text-slate-600">
          {r ? (r[k] > 0 ? fmtInt(r[k]) : '—') : '—'}
        </td>
      ))}
    </>
  );
}
