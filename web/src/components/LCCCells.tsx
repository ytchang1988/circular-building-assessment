import { useTranslation } from 'react-i18next';
import { fmtInt } from '@/lib/format';
import type { ElementResult } from '@/engine/types';

/** 6 LCC columns appended after the waste-code cells in every category table:
 *
 *    工程造價 C0 / 拆除費用 C1 / 運送處理 C2 / 殘值 D / 終期淨成本(名目) / 現值(PV)
 *
 * Sign convention: positive = 淨支出,negative = 淨收益。
 * `C2` combines 運送 (C2t) + 處理 (C2p) — handling (C2p) can be negative
 * when scrap-dealer receipts exceed the hauling cost, which is why 運送處理
 * sometimes shows up negative overall (e.g. metal-heavy elements).
 */
const KEYS = ['cost', 'lccC1', 'lccC2', 'lccD', 'lccNominal', 'lccPV'] as const;

const LABELS: Record<(typeof KEYS)[number], { code: string; name: string }> = {
  cost:       { code: 'C₀', name: '工程造價' },
  lccC1:      { code: 'C₁', name: '拆除費用' },
  lccC2:      { code: 'C₂', name: '運送處理' },
  lccD:       { code: 'D',  name: '殘值' },
  lccNominal: { code: '',  name: '終期淨成本' },
  lccPV:      { code: 'PV', name: '終期淨成本現值' },
};

export function LCCHeaders() {
  const { t } = useTranslation();
  return (
    <>
      {KEYS.map((k) => {
        const { code, name } = LABELS[k];
        const localized = t(`lcc.${k}`, { defaultValue: name });
        return (
          <th
            key={k}
            className="px-2 py-2 text-right"
            title={`${code} ${localized}`}
          >
            {code && <div className="font-semibold">{code}</div>}
            <div className={code ? 'text-[10px] font-normal text-slate-400' : 'font-semibold'}>
              {localized}
            </div>
          </th>
        );
      })}
    </>
  );
}

/** Signed int: negative values render in emerald (net benefit), positives in slate. */
function SignedCell({ v }: { v: number }) {
  if (v === 0) return <td className="px-2 py-2 text-right tabular-nums text-slate-400">—</td>;
  const cls = v < 0 ? 'text-emerald-600' : 'text-slate-700';
  return (
    <td className={`px-2 py-2 text-right tabular-nums ${cls}`}>
      {v > 0 ? '' : ''}{fmtInt(v)}
    </td>
  );
}

export function LCCRowCells({ r }: { r: ElementResult | null }) {
  if (!r) {
    return (
      <>
        {KEYS.map((k) => (
          <td key={k} className="px-2 py-2 text-right tabular-nums text-slate-400">—</td>
        ))}
      </>
    );
  }
  return (
    <>
      {/* C0 工程造價 is always a positive cost; no sign coloring */}
      <td className="px-2 py-2 text-right tabular-nums text-slate-700">
        {r.cost > 0 ? fmtInt(r.cost) : '—'}
      </td>
      <SignedCell v={r.lccC1} />
      <SignedCell v={r.lccC2} />
      <SignedCell v={r.lccD} />
      <SignedCell v={r.lccNominal} />
      <SignedCell v={r.lccPV} />
    </>
  );
}
