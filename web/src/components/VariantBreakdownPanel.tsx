import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentBreakdownRow } from '@/engine/variantBreakdown';
import { fmtInt, fmtNum } from '@/lib/format';

const COL_COUNT = 21;

/**
 * Hierarchical "構件 × 材料 MCI 拆解" panel mirroring the My MCI&PCI sheet.
 * Each parent row is a design variant actually in use on this page; the
 * indented child rows are its constituent materials with the full MCI
 * calculation chain. Σ(MCI × M) / Σ M = parent MCIp. All child rows are
 * always visible — the outer <details> toggles the whole panel.
 */
export function VariantBreakdownPanel({
  variants,
  defaultOpen = false,
}: {
  variants: ComponentBreakdownRow[];
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();

  if (variants.length === 0) return null;

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <details
      className="mb-4 rounded-md border border-slate-200 bg-white"
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-slate-700">
        {t('variantBreakdown.title')}
        <span className="ml-2 text-xs font-normal text-slate-500">
          {t('variantBreakdown.hint')}
        </span>
      </summary>
      <div className="overflow-x-auto border-t border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th rowSpan={2} className="px-3 py-2 align-bottom">{t('variantBreakdown.headers.name')}</th>
              <th rowSpan={2} className="px-2 py-2 text-right align-bottom">{t('variantBreakdown.headers.M')}</th>
              <th rowSpan={2} className="px-2 py-2 text-right align-bottom">%</th>
              <th colSpan={3} className="px-3 py-1 text-center border-l border-slate-200">
                {t('variantBreakdown.groups.input')}
              </th>
              <th colSpan={2} className="px-3 py-1 text-center border-l border-slate-200">
                {t('variantBreakdown.groups.eol')}
              </th>
              <th colSpan={5} className="px-3 py-1 text-center border-l border-slate-200">
                {t('variantBreakdown.groups.flow')}
              </th>
              <th colSpan={3} className="px-3 py-1 text-center border-l border-slate-200">
                {t('variantBreakdown.groups.life')}
              </th>
              <th colSpan={4} className="px-3 py-1 text-center border-l border-slate-200">
                {t('variantBreakdown.groups.mci')}
              </th>
              <th rowSpan={2} className="px-2 py-2 text-right align-bottom border-l border-slate-200 font-semibold text-slate-700">
                MCIp
              </th>
            </tr>
            <tr>
              <th className="px-2 py-1 text-right border-l border-slate-200">F_u</th>
              <th className="px-2 py-1 text-right" title="快速再生料比例 (木材等生質材 = 100%)">F_rr</th>
              <th className="px-2 py-1 text-right">F_r</th>
              <th className="px-2 py-1 text-right border-l border-slate-200">C_u</th>
              <th className="px-2 py-1 text-right">C_r</th>
              <th className="px-2 py-1 text-right border-l border-slate-200">V</th>
              <th className="px-2 py-1 text-right">W_o</th>
              <th className="px-2 py-1 text-right">W_fr</th>
              <th className="px-2 py-1 text-right">W_cr</th>
              <th className="px-2 py-1 text-right">W</th>
              <th className="px-2 py-1 text-right border-l border-slate-200">L</th>
              <th className="px-2 py-1 text-right">L_av</th>
              <th className="px-2 py-1 text-right">X</th>
              <th className="px-2 py-1 text-right border-l border-slate-200">LFI</th>
              <th className="px-2 py-1 text-right" title={t('variantBreakdown.ELFIHint') ?? ''}>LFI′</th>
              <th className="px-2 py-1 text-right">F(X)</th>
              <th className="px-2 py-1 text-right font-semibold text-slate-700">MCI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {variants.map((v, i) => (
              <Fragment key={i}>
                <tr className="bg-slate-100/60 font-semibold">
                  <td className="px-3 py-1.5">
                    <span className="text-slate-800">{v.variantName}</span>
                    {v.quantityLabel && (
                      <span className="ml-2 text-[10px] font-normal text-slate-500">
                        {v.quantityLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{fmtInt(v.totalM)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">100%</td>
                  <td colSpan={COL_COUNT - 4} className="px-2 py-1.5 border-l border-slate-200" />
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-900 border-l border-slate-200">
                    {fmtNum(v.MCIp)}
                  </td>
                </tr>
                {v.materials.map((m, mi) => (
                  <tr key={`${i}-${mi}`} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 whitespace-nowrap pl-8">
                      <span className="text-slate-500 mr-1">↳</span>
                      <span className="font-medium text-slate-800">{m.name}</span>
                      {m.note && <span className="ml-2 text-[10px] text-slate-500">{m.note}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(m.M)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{pct(m.pct)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums border-l border-slate-200">{pct(m.Fu)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(m.Frr)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(m.Fr)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums border-l border-slate-200">{pct(m.Cu)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(m.Cr)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums border-l border-slate-200">{fmtInt(m.V)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(m.Wo)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(m.Wfr)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(m.Wcr)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(m.W)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums border-l border-slate-200">{m.L}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m.Lav}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(m.X)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums border-l border-slate-200">{fmtNum(m.LFI)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(m.ELFI)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(m.FX)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-900">{fmtNum(m.MCI)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-400 border-l border-slate-200">—</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-2 text-[11px] text-slate-500">
          {t('variantBreakdown.footnote')}
        </p>
      </div>
    </details>
  );
}
