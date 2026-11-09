/**
 * Life Cycle Cost (LCC) engine for Taiwan 循環建築 methodology.
 * Source: 建築研究所 115 年「結合 LCC 之循環建築整合評估模式」v5 (2026-11)
 * Spec file: ../../LCC計算規格.md
 *
 * Per-row (構件分層 × 廢棄物類別 × 情境):
 *     C1 = m × (k + fAdd)                 大量拆除 + 精細拆除附加
 *     C2t = (m / 1000) × km × truckRate   運送 (元/噸公里)
 *     C2p = m × C2處理單價                處理 (可負 = 回收商收購)
 *     D   = m × D再生單價                 殘值
 *     nominal = C1 + C2t + C2p − D        終期淨成本 (名目)
 *     PV      = nominal / (1 + r)^life    現值,折現用 r = i − j − k_growth 近似式
 *
 * Mapping from our 7 waste codes to spec categories:
 *   wasteB5    → B5
 *   wasteR1301 → R-1301
 *   wasteR1304 → R-1304
 *   wasteR0401 → R-0401
 *   wasteR0701 → R-0701
 *   wasteR0201 → D-0299   (塑膠, same material class; our code vs spec code)
 *   wasteR0503 → R-0503
 */

import type { MaterialBucket } from './materialClassify';
import { computeWaste, type WasteBreakdown, type WasteKey } from './waste';

/** Building component layer; drives discount lifetime t. */
export type LCCLayer = '結構' | '外裝' | '內裝';

type LCCCatKey =
  | 'B5' | 'R0503' | 'R1301' | 'R1304'
  | 'D0299' | 'R0401' | 'R0411' | 'R0701' | 'D0899';

interface LCCCategoryParams {
  /** NT$/kg — handling cost (positive) or scrap-dealer receipt (negative). */
  c2: number;
  /** NT$/kg — residual value of recovered material. */
  d: number;
  /** Default distance (km) to the first processing site. */
  km: number;
  /** Whether precision-demolition surcharge f applies (only in scenario B). */
  usesF: boolean;
}

export const LCC_PARAMS = {
  kA: 0.285869,       // 元/kg  一般拆除 (scenario A)
  kB: 0.306698,       // 元/kg  綠色拆除 (scenario B)
  f: 18.1771,         // 元/kg  精細拆除附加 (scenario B + applicable cat)
  truckRate: 8.0,     // 元/噸公里
  inflation: 0.02,    // j
  growth: 0.0,        // k_growth (material real growth vs CPI)
  /** Nominal discount rate i: low = sensitivity-low, base = NDC rec'd, high = sens-high. */
  discount: { low: 0.042, base: 0.052, high: 0.062 },
  layers: { '結構': 60, '外裝': 30, '內裝': 20 } as Record<LCCLayer, number>,
  categories: {
    B5:    { c2: 1.70,  d: 0.20, km: 15, usesF: false },
    R0503: { c2: 3.50,  d: 0.00, km: 15, usesF: false },
    R1301: { c2: -8.00, d: 20.00, km: 20, usesF: false },
    R1304: { c2: -20.00, d: 70.00, km: 20, usesF: false },
    D0299: { c2: -1.50, d: 18.00, km: 20, usesF: true  },
    R0401: { c2: -0.75, d: 4.00,  km: 20, usesF: true  },
    R0411: { c2: 2.50,  d: 0.30,  km: 40, usesF: true  },
    R0701: { c2: 3.00,  d: 3.00,  km: 20, usesF: true  },
    D0899: { c2: 3.50,  d: 0.00,  km: 20, usesF: true  },
  } satisfies Record<LCCCatKey, LCCCategoryParams>,
} as const;

/** Mapping from our ElementResult waste keys → LCC_PARAMS.categories keys. */
const WASTE_TO_LCC: Record<WasteKey, LCCCatKey> = {
  wasteB5:    'B5',
  wasteR1301: 'R1301',
  wasteR1304: 'R1304',
  wasteR0401: 'R0401',
  wasteR0701: 'R0701',
  // Our code uses R-0201 for 塑膠; the LCC spec uses D-0299 for 塑膠. Same
  // material, different EPA code — we route to the spec's parameter set.
  wasteR0201: 'D0299',
  wasteR0503: 'R0503',
};

/** Real discount rate — spec mandates the **approximate** form, NOT Fisher. */
export function realRate(
  i: number,
  j = LCC_PARAMS.inflation,
  k = LCC_PARAMS.growth,
): number {
  return i - j - k;
}

export interface LCCResult {
  C1: number;        // 拆除費用
  C2t: number;       // 運送
  C2p: number;       // 處理
  D: number;         // 殘值
  nominal: number;   // 終期淨成本 (名目) = C1 + C2t + C2p − D
  PV: number;        // 終期淨成本現值 (life-discounted)
}

/**
 * Compute LCC for one element given its pre-computed waste-by-code breakdown,
 * the demolition scenario, and the LCC layer (which drives the discount life).
 */
export function computeLCC(
  waste: WasteBreakdown,
  green: boolean,
  layer: LCCLayer,
  iRate = LCC_PARAMS.discount.base,
): LCCResult {
  const k = green ? LCC_PARAMS.kB : LCC_PARAMS.kA;

  let C1 = 0, C2t = 0, C2p = 0, D = 0;
  for (const wk of Object.keys(WASTE_TO_LCC) as WasteKey[]) {
    const m = waste[wk];
    if (m <= 0) continue;
    const cat = LCC_PARAMS.categories[WASTE_TO_LCC[wk]];
    const fAdd = green && cat.usesF ? LCC_PARAMS.f : 0;
    C1  += m * (k + fAdd);
    C2t += (m / 1000) * cat.km * LCC_PARAMS.truckRate;
    C2p += m * cat.c2;
    D   += m * cat.d;
  }

  const nominal = C1 + C2t + C2p - D;
  const r = realRate(iRate);
  const life = LCC_PARAMS.layers[layer];
  const PV = nominal / Math.pow(1 + r, life);

  return { C1, C2t, C2p, D, nominal, PV };
}

// ---------------------------------------------------------------------------
// Scenario comparison (一般拆除 vs 當前設定)
// ---------------------------------------------------------------------------

/**
 * Per-element input for an aggregated LCC scenario rollup. The caller provides
 * the as-configured `green` flag; `aggregateLCCScenario` may override it when
 * computing the all-standard-demolition counterfactual. `mat` is the material
 * breakdown (ElementResult already satisfies this shape structurally).
 */
export interface LCCItem {
  green: boolean;
  hints: string;
  isStructural: boolean;
  layer: LCCLayer;
  mat: Record<MaterialBucket, number>;
}

/** Aggregated LCC terminal values across a scenario (matches ComponentResult's
 *  lcc* fields; `C2` combines transport C2t and handling C2p). Also carries
 *  the per-waste-code mass breakdown under this scenario so downstream charts
 *  (e.g. the terminal-net waterfall) can draw with the right routing. */
export interface LCCScenarioAgg {
  C1: number;
  C2: number;
  D: number;
  nominal: number;
  PV: number;
  waste: WasteBreakdown;
}

/**
 * Sum LCC across a set of elements under a chosen scenario.
 *
 * - `forceGreen === undefined` → each element uses its own `green` flag
 *   (reproduces the as-configured ComponentResult totals).
 * - `forceGreen === false`     → the 一般拆除 counterfactual (everyone mixes).
 * - `forceGreen === true`      → the 全綠色拆除 counterfactual.
 *
 * Material masses are re-routed to waste codes under the chosen scenario so
 * the LCC parameters (k, f, c2, d, km) line up with the right waste streams.
 */
export function aggregateLCCScenario(
  items: LCCItem[],
  forceGreen?: boolean,
  iRate = LCC_PARAMS.discount.base,
): LCCScenarioAgg {
  let C1 = 0, C2 = 0, D = 0, nominal = 0, PV = 0;
  const wasteAgg: WasteBreakdown = {
    wasteB5: 0, wasteR1301: 0, wasteR1304: 0,
    wasteR0401: 0, wasteR0701: 0, wasteR0201: 0, wasteR0503: 0,
  };
  for (const it of items) {
    const green = forceGreen ?? it.green;
    const waste = computeWaste(it.mat, green, it.hints, it.isStructural);
    for (const wk of Object.keys(waste) as WasteKey[]) wasteAgg[wk] += waste[wk];
    const r = computeLCC(waste, green, it.layer, iRate);
    C1 += r.C1;
    C2 += r.C2t + r.C2p;
    D  += r.D;
    nominal += r.nominal;
    PV += r.PV;
  }
  return { C1, C2, D, nominal, PV, waste: wasteAgg };
}
