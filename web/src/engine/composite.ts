/**
 * Composite-surface engine for area-based categories where the user picks a
 * pre-bundled construction (e.g. RC外牆外裝). Weight, EC, and some flags come
 * from the construction; project/layer life and other constants are template
 * defaults.
 *
 * Variables follow the spreadsheet's naming (FU, FR, FRR, CR, CU, EF, EC)
 * so the math is auditable against `CI計算格式` + `CI&EC計算` sheets.
 *
 * Sub-material mode: when a construction declares `materials[]`, MCI is
 * computed per sub-material (with optional per-material FR/CR/downcycle/
 * lightweight overrides) and rolled up by mass-weighted mean:
 *   M       = Σ M_mat
 *   V,Wo,WF,WC,W = Σ per-material
 *   MCIp    = Σ(MCI_mat × M_mat) / Σ M_mat     ← authoritative aggregate
 *   LFI,ELFI = mass-weighted mean of the sub-material values
 * The CI_CON reported field is the construction-level FU + FRR + FR (not the
 * sub-material blended value) so the panel's "input" column stays readable.
 */

import type { ElementResult, YN } from './types';
import { singleBucket } from './materialClassify';
import { computeWaste } from './waste';
import { computeLCC } from './lcc';

export interface CompositeMaterial {
  name: string;
  /** Mass per m² for ONE build (not including updates). */
  weightPerM2New: number;
  /** 'base' = installed once; 'surface' = replaced with every update cycle. */
  layer: 'base' | 'surface';
  /** Override construction FR (when greenRecycled is also false). */
  fr?: number;
  /** Rapid-renewable (biogenic) share — wood → 1.0; default 0. */
  frr?: number;
  /** Override template CR for this material. */
  cr?: number;
  /** Override construction downcycle flag. */
  downcycle?: YN;
  /** Override construction lightweight flag. */
  lightweight?: YN;
}

export interface CompositeConstruction {
  name: string;
  weightPerM2: number;        // M / area (precomputed = base + surface×(updateCount+1))
  updateCount: number;        // c, used for productLife = 60 / (c + 1)
  frWhenGreen: number;        // FR applied when greenRecycled flag is true
  downcycle: YN;
  lightweight: YN;
  componentDetachable: YN;
  systemDetachable: YN;
  designECPerM2: number;      // kgCO2eq/m² for the design case
  /** NT$/m² assembled unit price from 營建物價 (per 工料類). */
  unitPrice?: number;
  /** Optional sub-material composition. When present, MCI is aggregated. */
  materials?: CompositeMaterial[];
}

export interface CompositeTemplate {
  category: string;
  categoryEn: string;
  unitSymbol: string;         // "m²"
  layerLifeYears: number;     // 2-2 hardcodes 30
  projectLifeYears: number;   // 60
  FRR: number;
  EF: number;
  CU: number;
  CR: number;                 // 2-2 hardcodes 75%
  EC_efficiency: number;
  baselineConstruction: string;  // row used for baseline EC
  constructions: CompositeConstruction[];
  elementDefaults: {
    constructionType: string;
    reused: boolean;
    greenRecycled: boolean;
    prefabModular: boolean;
  };
}

export interface AreaElement {
  id: string;
  floor?: string;
  family?: string;
  areaM2: number;
  note?: string;
  constructionType: string;
  reused: boolean;
  greenRecycled: boolean;
  prefabModular: boolean;
  greenDemolition: boolean;
}

function findConstruction(
  template: CompositeTemplate,
  name: string,
): CompositeConstruction {
  const c = template.constructions.find((x) => x.name === name);
  if (!c) throw new Error(`Unknown construction "${name}"`);
  return c;
}

/**
 * Per-material MCI math — same formula as variantBreakdown but exposed here so
 * the engine's aggregated MCIp exactly matches what the breakdown panel shows.
 */
interface MaterialMCI {
  M: number;
  V: number; Wo: number; WF: number; WC: number; W: number;
  LFI: number; ELFI: number; MCI: number;
}

function materialMCI(
  mat: CompositeMaterial,
  c: CompositeConstruction,
  template: CompositeTemplate,
  areaM2: number,
  FU: number,
  greenRecycled: boolean,
): MaterialMCI {
  const factor = mat.layer === 'base' ? 1 : c.updateCount + 1;
  const M = areaM2 * mat.weightPerM2New * factor;

  const FR = mat.fr !== undefined
    ? mat.fr
    : (greenRecycled ? c.frWhenGreen : 0);
  const FRR = mat.frr ?? template.FRR;
  const CR = mat.cr !== undefined ? mat.cr : template.CR;
  const CU = template.CU;
  const downcycle = mat.downcycle ?? c.downcycle;
  const lightweight = mat.lightweight ?? c.lightweight;

  // Base layer stays the whole project life; surface layers cycle every
  // projectLife/(updates+1) years (same as the construction-level productLife).
  const L = mat.layer === 'base'
    ? template.projectLifeYears
    : template.projectLifeYears / (c.updateCount + 1);
  const Lav = template.layerLifeYears;
  const X = Lav > 0 ? L / Lav : 0;

  const V = Math.max(0, M * (1 - FU - FRR - FR));
  const Wo = Math.max(0, M * (1 - CU - CR));
  const WF = template.EF > 0 ? (M * FR * (1 - template.EF)) / template.EF : 0;
  const WC = M * CR * (1 - template.EC_efficiency);
  const W = Wo + (WF + WC) / 2;
  const denom = 2 * M + (WF - WC) / 2;
  const LFI = denom > 0 ? (V + W) / denom : 0;
  const Level = downcycle === 'Y' ? 0.8 : 1;
  const Re = lightweight === 'Y' ? 0.9 : 1;
  const ELFI = Level > 0 ? (LFI * Re) / Level : 0;
  const FX = X > 0 ? 0.9 / X : 0;
  // EMF clamp: MCI ∈ [0, 1] (short-life materials with large F(X) can push the
  // raw value below zero; cap at 0 per the EMF Material Circularity paper).
  const MCI = X > 0 ? Math.max(0, 1 - ELFI * FX) : 0;

  return { M, V, Wo, WF, WC, W, LFI, ELFI, MCI };
}

export function computeAreaElement(
  el: AreaElement,
  template: CompositeTemplate,
): ElementResult {
  const c = findConstruction(template, el.constructionType);
  const baseline = findConstruction(template, template.baselineConstruction);

  const FU = el.reused ? 1 : 0;
  const FRR = template.FRR;
  const FR = el.greenRecycled ? c.frWhenGreen : 0;
  const CI_CON = FU + FRR + FR;

  const productLife = template.projectLifeYears / (c.updateCount + 1);
  const CI_USE = productLife / template.layerLifeYears;
  const CU = template.CU;
  const CR = template.CR;
  const CI_EOL = CU + CR;

  let M: number, V: number, Wo: number, WF: number, WC: number, W: number;
  let LFI: number, ELFI: number, MCIp: number;

  if (c.materials && c.materials.length > 0) {
    // Sub-material path: aggregate by mass.
    const rows = c.materials.map((m) =>
      materialMCI(m, c, template, el.areaM2, FU, el.greenRecycled),
    );
    M = rows.reduce((s, r) => s + r.M, 0);
    V = rows.reduce((s, r) => s + r.V, 0);
    Wo = rows.reduce((s, r) => s + r.Wo, 0);
    WF = rows.reduce((s, r) => s + r.WF, 0);
    WC = rows.reduce((s, r) => s + r.WC, 0);
    W = rows.reduce((s, r) => s + r.W, 0);
    LFI = M > 0 ? rows.reduce((s, r) => s + r.LFI * r.M, 0) / M : 0;
    ELFI = M > 0 ? rows.reduce((s, r) => s + r.ELFI * r.M, 0) / M : 0;
    MCIp = M > 0 ? rows.reduce((s, r) => s + r.MCI * r.M, 0) / M : 0;
  } else {
    // Legacy single-bucket path: FR/CR/flags from construction only.
    M = el.areaM2 * c.weightPerM2;
    V = M * (1 - CI_CON);
    Wo = M * (1 - CI_EOL);
    WF = (M * FR * (1 - template.EF)) / template.EF;
    WC = M * CR * (1 - template.EC_efficiency);
    W = Wo + (WF + WC) / 2;
    LFI = (V + W) / (2 * M + (WF - WC) / 2);
    const lightweightFactor = c.lightweight === 'Y' ? 0.9 : 1;
    const downcycleFactor = c.downcycle === 'Y' ? 0.8 : 1;
    ELFI = (LFI * lightweightFactor) / downcycleFactor;
    MCIp = CI_USE === 0 ? 0 : Math.max(0, 1 - (0.9 * ELFI) / CI_USE);
  }

  const componentDetachFactor = c.componentDetachable === 'N' ? 0.8 : 1;
  const modularFactor = el.prefabModular ? 1.1 : 1;
  const PCI = MCIp * componentDetachFactor * modularFactor;

  const systemDetachFactor = c.systemDetachable === 'N' ? 0.9 : 1;
  const SCIp = PCI * systemDetachFactor;

  const baselineEC = el.areaM2 * baseline.designECPerM2;
  const designEC = el.areaM2 * c.designECPerM2;
  const reduction = designEC - baselineEC;
  const reductionRatio = baselineEC === 0 ? 0 : reduction / baselineEC;

  const breakdown = singleBucket(c.name, M);
  const waste = computeWaste(breakdown, el.greenDemolition, c.name);
  const cost = el.areaM2 * (c.unitPrice ?? 0);
  // Cladding/外裝 → LCC 外裝層,壽命 30 年
  const lcc = computeLCC(waste, el.greenDemolition, '外裝');
  return {
    M,
    massMineral: breakdown.massMineral,
    massMetal: breakdown.massMetal,
    massGlass: breakdown.massGlass,
    massWood: breakdown.massWood,
    massPlastic: breakdown.massPlastic,
    massOther: breakdown.massOther,
    ...waste,
    CI_CON,
    CI_USE,
    CI_EOL,
    V,
    Wo,
    WF,
    WC,
    W,
    LFI,
    ELFI,
    MCIp,
    PCI,
    SCIp,
    baselineEC,
    designEC,
    reduction,
    reductionRatio,
    cost,
    lccC1: lcc.C1,
    lccC2: lcc.C2t + lcc.C2p,
    lccD: lcc.D,
    lccNominal: lcc.nominal,
    lccPV: lcc.PV,
  };
}
