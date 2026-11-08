import { useTranslation } from 'react-i18next';

/**
 * Section-header row rendered ABOVE each category table's column headers.
 *
 * Five groups, in order, with colspans sized to the host table:
 *   1. 基本資料      (checkbox + floor/family/area/strength/construction/glass/frame…)
 *   2. 材料組成      (6 material buckets — always 6)
 *   3. 循環手法與表現 (reused / prefab / greenRecycled? / MCIp / PCI / EC)
 *   4. 物質去向      (greenDemolition + 7 waste codes — always 8)
 *   5. 生命週期成本  (C₀ C₁ C₂ D 名目 PV — always 6)
 *
 * Plus a trailing ungrouped column for per-row delete action.
 *
 * Callers pass only the two variable colspans; materials (6), destination (8),
 * and LCC (6) are constant across every category table.
 */
export function TableGroupHeaders({
  basicCols,
  circularityCols,
}: {
  basicCols: number;
  circularityCols: number;
}) {
  const { t } = useTranslation();
  const cell =
    'px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 border-r border-slate-200 last:border-r-0';
  return (
    <tr className="bg-slate-100 border-b border-slate-200">
      <th colSpan={basicCols} className={cell}>
        {t('tableGroups.basic')}
      </th>
      <th colSpan={6} className={cell}>
        {t('tableGroups.materials')}
      </th>
      <th colSpan={circularityCols} className={cell}>
        {t('tableGroups.circularity')}
      </th>
      <th colSpan={8} className={cell}>
        {t('tableGroups.destination')}
      </th>
      <th colSpan={6} className={cell}>
        {t('tableGroups.lcc')}
      </th>
      {/* trailing ungrouped column for the delete button */}
      <th className="border-r-0" />
    </tr>
  );
}
