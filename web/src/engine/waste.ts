/**
 * Taiwan EPA construction-waste code breakdown, aligned to the BCI reference
 * sheet's 材料 tab.
 *
 * Mineral flow depends on BOTH the source category (structural vs not) AND
 * whether 綠色拆除 is enabled (sorted vs mixed demolition):
 *
 *                             一般拆除      綠色拆除
 *   結構 RC 混凝土              B5          B5           (always bulk aggregate)
 *   非結構 inert 礦物           R-0503      B5           (sorted → aggregate stream)
 *     (水泥砂漿/磚/磁磚/ALC/石/塗料)
 *   板材 (石膏板/矽酸鈣板)       R-0503      R-0503       (not inert, boards/gypsum)
 *
 * Non-mineral materials (unchanged by category):
 *
 *                       一般拆除           綠色拆除
 *   鋼筋 / 鋼 / 鐵      R-1301 廢鐵        R-1301 廢鐵
 *   鋁                  R-0503 混合物      R-1304 廢鋁
 *   玻璃                R-0503 混合物      R-0401 廢玻璃
 *   木材                R-0503 混合物      R-0701 廢木材
 *   塑膠                R-0503 混合物      R-0201 廢塑膠
 *   其他                R-0503 混合物      R-0503 混合物
 *
 * Code semantics:
 *   B5      廢土方       aggregate-mineral stream (soil / bulk concrete / stone)
 *   R-0201  廢塑膠       recyclable plastic
 *   R-0401  廢玻璃       recyclable glass
 *   R-0503  營建混合物   mixed construction waste (default when unsorted)
 *   R-0701  廢木材       recyclable wood
 *   R-1301  廢鐵         ferrous scrap (always separated)
 *   R-1304  廢鋁         aluminum scrap
 */

import type { MaterialBucket } from './materialClassify';
import { MATERIAL_BUCKETS, routeMaterial } from './sankey';

export const WASTE_KEYS = [
  'wasteB5',
  'wasteR1301', 'wasteR1304',
  'wasteR0401', 'wasteR0701',
  'wasteR0201', 'wasteR0503',
] as const;

export type WasteKey = (typeof WASTE_KEYS)[number];
export type WasteBreakdown = Record<WasteKey, number>;

const emptyWaste = (): WasteBreakdown => ({
  wasteB5: 0,
  wasteR1301: 0, wasteR1304: 0,
  wasteR0401: 0, wasteR0701: 0,
  wasteR0201: 0, wasteR0503: 0,
});

/**
 * Split the per-bucket material mass into waste codes.
 *
 * @param mat          Material breakdown (massMineral, massMetal, ...).
 * @param green        Whether 綠色拆除 is enabled for this element.
 * @param hints        Free-text name (construction type, frame, etc.).
 *                     Used to detect 鋁 (vs 鐵) for the metal bucket and
 *                     板材 (石膏板/矽酸鈣板) exceptions in the mineral bucket.
 * @param isStructural Whether this element is bulk structural RC (柱/梁/樓版).
 *                     Structural minerals go to B5 in both scenarios.
 */
export function computeWaste(
  mat: Record<MaterialBucket, number>,
  green: boolean,
  hints: string = '',
  isStructural: boolean = false,
): WasteBreakdown {
  // Delegates routing to `sankey.routeMaterial` so both totals and the
  // Sankey chart draw from one policy table.
  const w = emptyWaste();
  for (const b of MATERIAL_BUCKETS) {
    const code = routeMaterial(b, green, hints, isStructural);
    w[code] += mat[b];
  }
  return w;
}
