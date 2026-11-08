/**
 * Material-category classifier. Maps a free-text construction / assembly name
 * to one of the six material buckets displayed per row.
 *
 * Templates don't yet carry per-layer breakdowns, so this heuristic puts the
 * entire mass of a composite/area element into whichever bucket best matches
 * its name. The RC monolithic engine does NOT use this — it computes mineral
 * (concrete) + metal (rebar) directly from density data.
 */

export type MaterialBucket =
  | 'massMineral'
  | 'massMetal'
  | 'massGlass'
  | 'massWood'
  | 'massPlastic'
  | 'massOther';

const PATTERNS: Array<{ bucket: MaterialBucket; re: RegExp }> = [
  // Metal first (so "鋼筋混凝土" matches metal before mineral? Actually concrete
  // dominates mass in RC — but RC categories don't use this classifier).
  { bucket: 'massGlass', re: /玻璃|glass|low-?e/i },
  { bucket: 'massMetal', re: /鋁|鋼|鐵|不鏽鋼|金屬|aluminum|aluminium|steel|iron|metal|zinc|銅/i },
  { bucket: 'massWood', re: /木|竹|wood|bamboo|實木|合板|夾板/i },
  { bucket: 'massPlastic', re: /塑膠|PVC|frp|塑料|壓克力|聚|epoxy|樹脂|plastic|resin/i },
  {
    bucket: 'massMineral',
    re: /RC|混凝土|預拌|水泥|砂漿|粉刷|磚|ALC|石|瓷|磁磚|石膏|cement|concrete|mortar|tile|brick|stone|塗料|油漆|paint/i,
  },
];

export function classifyMaterial(name: string): MaterialBucket {
  for (const { bucket, re } of PATTERNS) {
    if (re.test(name)) return bucket;
  }
  return 'massOther';
}

/** Return a zeroed breakdown object. */
export function emptyBreakdown(): Record<MaterialBucket, number> {
  return {
    massMineral: 0, massMetal: 0, massGlass: 0,
    massWood: 0, massPlastic: 0, massOther: 0,
  };
}

/** Put the full mass into the bucket chosen for `name`. */
export function singleBucket(
  name: string,
  mass: number,
): Record<MaterialBucket, number> {
  const b = emptyBreakdown();
  b[classifyMaterial(name)] = mass;
  return b;
}
