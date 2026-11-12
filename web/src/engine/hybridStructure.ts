/**
 * Hybrid structural engine (柱/樑 for 混合型建築).
 *
 * Supports steel (hollow structural pipe/box) and wood (engineered timber)
 * members alongside the existing RC path. All share the same `ColumnElement`
 * shape; which engine runs is dispatched on `materialType`.
 *
 * Volume input model:
 *   - Steel:  体積 = outer envelope (m³), effective steel = envelope × 15% fill
 *             (approximates typical 300×300×9mm or Φ300×9mm hollow sections;
 *             solid sections would need fillRatio=1.0, out of scope for MVP).
 *   - Wood:   体積 = solid wood volume; mass = volume × density.
 *
 * MCI params use research defaults the user approved (FR=0/CR=90 for steel;
 * FRR=100/CR=100 for wood). Biogenic carbon storage is always included for
 * wood — netEC = (processing EC) − (storage), per EN 15804 Module A1.
 */

import type { ColumnElement, ElementResult, WoodMemberType, YN } from './types';
import { computeWaste } from './waste';
import { computeLCC } from './lcc';

export interface SteelParams {
  /** Steel density kg/m³ — 7850 (A36/SS400 structural steel). */
  density: number;
  /** Envelope → steel volume ratio. 0.15 ≈ hollow 300×300×9 or Φ300×9. */
  fillRatio: number;
  /** FR, user-specified 0% (virgin steel from BOF / 高爐). */
  recycledRatio: number;
  /** CR, user-specified 90% (steel is highly recyclable). */
  recyclableRatio: number;
  downcycle: YN;
  lightweight: YN;
  /** kgCO2eq per kg steel — 1.46 (ICE Database typical structural). */
  ecFactor: number;
}

export interface WoodParams {
  /** Display name. */
  name: string;
  /** kg/m³ dried (12% MC for most engineered wood). */
  density: number;
  /** kgCO2eq per kg (processing: forestry + mill + transport, excluding storage). */
  ecFactor: number;
  /** kgCO2 captured per kg of dried wood (biogenic storage). Negative EC. */
  carbonStoragePerKg: number;
  downcycle: YN;
  lightweight: YN;
}

export const STEEL_PARAMS: SteelParams = {
  density: 7850,
  fillRatio: 0.15,
  recycledRatio: 0,      // user: FR = 0% (保守,原生鋼材假設)
  recyclableRatio: 0.9,  // user: CR = 90%
  downcycle: 'N',
  lightweight: 'N',
  ecFactor: 1.46,
};

export const WOOD_PARAMS: Record<WoodMemberType, WoodParams> = {
  solidWood: {
    name: '實木 (SPF/柳杉)',
    density: 400,
    ecFactor: 0.45,
    carbonStoragePerKg: 1.65,
    downcycle: 'N',
    lightweight: 'Y',
  },
  glulam: {
    name: '集成材 (Glulam)',
    density: 500,
    ecFactor: 0.60,
    carbonStoragePerKg: 1.65,
    downcycle: 'N',
    lightweight: 'Y',
  },
  clt: {
    name: 'CLT 跨層積材',
    density: 490,
    ecFactor: 0.55,
    carbonStoragePerKg: 1.65,
    downcycle: 'N',
    lightweight: 'Y',
  },
  lvl: {
    name: 'LVL 單板積層材',
    density: 550,
    ecFactor: 0.70,
    carbonStoragePerKg: 1.60,
    downcycle: 'N',
    lightweight: 'Y',
  },
};

/** Shared constants (same as columns template defaults). */
const EF = 0.9;            // 製造階段回收效率
const EC_EFFICIENCY = 0.9; // 拆除階段回收效率
const CU = 0;              // 未來可再使用材料比例
const FRR_default = 0;     // 快速再生料比例,木材另算
const PROJECT_LIFE = 60;
const LAYER_LIFE = 60;     // 結構層壽命 = 專案壽命 → X=1

function wasteFromMetal(M: number, el: ColumnElement) {
  // Steel → 全部算金屬 → 廢鐵 R-1301
  return computeWaste(
    { massMineral: 0, massMetal: M, massGlass: 0, massWood: 0, massPlastic: 0, massOther: 0 },
    el.greenDemolition,
    '鋼',  // 金屬 → iron family
    false, // not structural-RC path
  );
}

function wasteFromWood(M: number, el: ColumnElement) {
  // Wood → 全部算木材 → 廢木材 R-0701 (green) / R-0503 (non-green)
  return computeWaste(
    { massMineral: 0, massMetal: 0, massGlass: 0, massWood: M, massPlastic: 0, massOther: 0 },
    el.greenDemolition,
    '木',
    false,
  );
}

/** Steel column/beam compute. envelope m³ × fillRatio × density = M. */
export function computeSteelElement(
  el: ColumnElement,
  params: SteelParams = STEEL_PARAMS,
): ElementResult {
  const M = el.volumeM3 * params.fillRatio * params.density;

  const FU = el.reused ? 1 : 0;
  const FRR = FRR_default;
  const FR = params.recycledRatio;
  const CI_CON = FU + FRR + FR;
  const CI_USE = PROJECT_LIFE / LAYER_LIFE; // = 1
  const CR = params.recyclableRatio;
  const CI_EOL = CU + CR;

  const V = Math.max(0, M * (1 - FU - FRR - FR));
  const Wo = Math.max(0, M * (1 - CU - CR));
  const WF = (M * FR * (1 - EF)) / EF;
  const WC = M * CR * (1 - EC_EFFICIENCY);
  const W = Wo + (WF + WC) / 2;

  const denom = 2 * M + (WF - WC) / 2;
  const LFI = denom > 0 ? (V + W) / denom : 0;
  const Level = params.downcycle === 'Y' ? 0.8 : 1;
  const Re = params.lightweight === 'Y' ? 0.9 : 1;
  const ELFI = Level > 0 ? (LFI * Re) / Level : 0;
  const MCIp = Math.max(0, 1 - (0.9 * ELFI) / CI_USE);

  // Detachability: steel is typically bolted → componentDetachable=Y; system
  // joints are welded or bolted — assume Y for hybrid.
  const PCI = MCIp * 1.0 * (el.prefabModular ? 1.1 : 1);
  const SCIp = PCI * 1.0;

  const designEC = M * params.ecFactor;
  // Baseline: compare to equivalent RC column mass and EC. Rough rule: an RC
  // member of similar envelope has M ≈ volumeM3 × 2714 (concrete + rebar
  // density sum) and EC ≈ M × 0.14 kgCO2/kg → volumeM3 × 380. Used for Δ only.
  const baselineEC = el.volumeM3 * 380;
  const reduction = designEC - baselineEC;
  const reductionRatio = baselineEC === 0 ? 0 : reduction / baselineEC;

  const waste = wasteFromMetal(M, el);
  const lcc = computeLCC(waste, el.greenDemolition, '結構');
  return {
    M,
    massMineral: 0,
    massMetal: M,
    massGlass: 0,
    massWood: 0,
    massPlastic: 0,
    massOther: 0,
    ...waste,
    CI_CON, CI_USE, CI_EOL,
    V, Wo, WF, WC, W, LFI, ELFI,
    MCIp, PCI, SCIp,
    baselineEC, designEC, reduction, reductionRatio,
    cost: 0,
    lccC1: lcc.C1,
    lccC2: lcc.C2t + lcc.C2p,
    lccD: lcc.D,
    lccNominal: lcc.nominal,
    lccPV: lcc.PV,
  };
}

/** Wood column/beam compute. volume m³ × density = M. Biogenic storage
 *  subtracted from designEC. */
export function computeWoodElement(
  el: ColumnElement,
  params: WoodParams,
): ElementResult {
  const M = el.volumeM3 * params.density;

  const FU = el.reused ? 1 : 0;
  const FRR = 1.0;  // wood → 100% rapid renewable
  const FR = 0;
  const CI_CON = FU + FRR + FR;
  const CI_USE = PROJECT_LIFE / LAYER_LIFE; // = 1
  const CR = 1.0;  // wood → 100% recyclable/compostable per user
  const CI_EOL = CU + CR;

  const V = Math.max(0, M * (1 - FU - FRR - FR));  // ≈ 0
  const Wo = Math.max(0, M * (1 - CU - CR));        // ≈ 0
  const WF = (M * FR * (1 - EF)) / EF;              // = 0
  const WC = M * CR * (1 - EC_EFFICIENCY);          // ≈ 0.1M
  const W = Wo + (WF + WC) / 2;

  const denom = 2 * M + (WF - WC) / 2;
  const LFI = denom > 0 ? (V + W) / denom : 0;
  const Level = params.downcycle === 'Y' ? 0.8 : 1;
  const Re = params.lightweight === 'Y' ? 0.9 : 1;
  const ELFI = Level > 0 ? (LFI * Re) / Level : 0;
  const MCIp = Math.max(0, 1 - (0.9 * ELFI) / CI_USE);

  // Wood members bolted with metal connectors → componentDetachable=Y.
  const PCI = MCIp * 1.0 * (el.prefabModular ? 1.1 : 1);
  const SCIp = PCI * 1.0;

  // Design EC: processing EC − biogenic carbon storage (EN 15804 Module A1).
  const designEC = M * (params.ecFactor - params.carbonStoragePerKg);
  const baselineEC = el.volumeM3 * 380;  // RC equivalent (same as steel)
  const reduction = designEC - baselineEC;
  const reductionRatio = baselineEC === 0 ? 0 : reduction / baselineEC;

  const waste = wasteFromWood(M, el);
  const lcc = computeLCC(waste, el.greenDemolition, '結構');
  return {
    M,
    massMineral: 0,
    massMetal: 0,
    massGlass: 0,
    massWood: M,
    massPlastic: 0,
    massOther: 0,
    ...waste,
    CI_CON, CI_USE, CI_EOL,
    V, Wo, WF, WC, W, LFI, ELFI,
    MCIp, PCI, SCIp,
    baselineEC, designEC, reduction, reductionRatio,
    cost: 0,
    lccC1: lcc.C1,
    lccC2: lcc.C2t + lcc.C2p,
    lccD: lcc.D,
    lccNominal: lcc.nominal,
    lccPV: lcc.PV,
  };
}
