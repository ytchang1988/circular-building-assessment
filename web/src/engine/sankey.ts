/**
 * Single source of truth for "material bucket → waste code" routing.
 *
 * Used by both `computeWaste` (per-element totals) and `buildSankeyFlows`
 * (per-element tuples for the 物質流向 Sankey chart).
 *
 * See `waste.ts` for the policy table this encodes.
 */

import type { MaterialBucket } from './materialClassify';
import type { ElementResult } from './types';
import type { WasteKey } from './waste';

export const MATERIAL_BUCKETS: readonly MaterialBucket[] = [
  'massMineral', 'massMetal', 'massGlass', 'massWood', 'massPlastic', 'massOther',
] as const;

/** Return the single waste code the given material bucket routes to. */
export function routeMaterial(
  bucket: MaterialBucket,
  green: boolean,
  hints: string,
  isStructural: boolean,
): WasteKey {
  const isAluminum = /鋁|aluminum|aluminium/i.test(hints);
  const isBoard = /板|石膏|矽酸鈣/i.test(hints);

  switch (bucket) {
    case 'massMineral':
      if (isStructural) return 'wasteB5';
      if (isBoard) return 'wasteR0503';
      return green ? 'wasteB5' : 'wasteR0503';
    case 'massMetal':
      if (isAluminum) return green ? 'wasteR1304' : 'wasteR0503';
      return 'wasteR1301';
    case 'massGlass':
      return green ? 'wasteR0401' : 'wasteR0503';
    case 'massWood':
      return green ? 'wasteR0701' : 'wasteR0503';
    case 'massPlastic':
      return green ? 'wasteR0201' : 'wasteR0503';
    case 'massOther':
      return 'wasteR0503';
  }
}

/** One (source → material → waste) edge, in kg. */
export interface SankeyFlow {
  source: string;
  material: MaterialBucket;
  waste: WasteKey;
  value: number;
}

export interface SankeyItem {
  source: string;
  green: boolean;
  hints: string;
  isStructural: boolean;
  result: ElementResult;
}

/** Collapse per-element material masses into (source, material, waste) tuples. */
export function buildSankeyFlows(items: SankeyItem[]): SankeyFlow[] {
  const map = new Map<string, SankeyFlow>();
  for (const it of items) {
    for (const b of MATERIAL_BUCKETS) {
      const mass = it.result[b];
      if (mass <= 0) continue;
      const waste = routeMaterial(b, it.green, it.hints, it.isStructural);
      const key = `${it.source}|${b}|${waste}`;
      const cur = map.get(key);
      if (cur) cur.value += mass;
      else map.set(key, { source: it.source, material: b, waste, value: mass });
    }
  }
  return Array.from(map.values());
}
