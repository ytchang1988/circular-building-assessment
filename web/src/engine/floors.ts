/**
 * Floors engine (3-2 地坪). Per-construction per-building-class pre-computed
 * total weight and EC (table already accounts for base + surface replacements
 * over the project lifecycle).
 *
 * Sub-material mode: when a construction declares `materials[]`, each material
 * carries its own `layer: 'base' | 'surface'` so the lifecycle factor picks
 * the right update count. Per-material MCI is aggregated mass-weighted.
 * Wood sub-materials typically get frr=1 (rapid-renewable) and cr=1.
 */
import type { ElementResult, YN } from './types';
import { singleBucket } from './materialClassify';
import { computeWaste } from './waste';
import { computeLCC } from './lcc';

export interface FloorMaterial {
  name: string;
  /** Mass per m² for ONE build. */
  weightPerM2New: number;
  /** 'base' uses baseUpdateCount; 'surface' uses surfaceUpdateCount. */
  layer: 'base' | 'surface';
  /** Override FR (recycled feedstock). Default = template FR (0). */
  fr?: number;
  /** Rapid-renewable (biogenic) share — wood → 1.0; default 0. */
  frr?: number;
  /** Override CR (recyclability). Default = template.CR. */
  cr?: number;
  /** Override construction downcycle flag. */
  downcycle?: YN;
  /** Override construction lightweight flag. */
  lightweight?: YN;
}

export interface FloorByClass {
  totalWeightPerM2: number;
  totalECPerM2: number;
  baseUpdateCount: number;
  surfaceUpdateCount: number;
}

export interface FloorConstruction {
  name: string;
  downcycle: YN;
  lightweight: YN;
  componentDetachable: YN;
  systemDetachable: YN;
  byClass: Record<string, FloorByClass>;
  /** NT$/m² assembled unit price (per installation, before lifecycle updates). */
  unitPrice?: number;
  /** Optional sub-material composition. When present, MCI is aggregated. */
  materials?: FloorMaterial[];
}

export interface FloorsTemplate {
  category: string;
  categoryEn: string;
  unitSymbol: string;
  projectLifeYears: number;
  FRR: number;
  EF: number;
  CU: number;
  CR: number;
  EC_efficiency: number;
  baselineConstruction: string;
  buildingClasses: string[];
  defaultBuildingClass: string;
  constructions: FloorConstruction[];
  elementDefaults: {
    constructionType: string;
    reused: boolean;
    greenRecycled: boolean;
    prefabModular: boolean;
  };
}

export interface FloorElement {
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
  template: FloorsTemplate,
  name: string,
): FloorConstruction {
  const c = template.constructions.find((x) => x.name === name);
  if (!c) throw new Error(`Unknown floor construction "${name}"`);
  return c;
}

/**
 * Per-material MCI math — same formula as variantBreakdown/composite so the
 * engine's aggregated MCIp matches what the breakdown panel displays.
 */
interface MaterialMCI {
  M: number;
  V: number; Wo: number; WF: number; WC: number; W: number;
  LFI: number; ELFI: number; MCI: number;
}

function materialMCI(
  mat: FloorMaterial,
  c: FloorConstruction,
  template: FloorsTemplate,
  areaM2: number,
  baseUpdates: number,
  surfaceUpdates: number,
  FU: number,
  Lav: number,
): MaterialMCI {
  const ownUpdates = mat.layer === 'base' ? baseUpdates : surfaceUpdates;
  const factor = ownUpdates + 1;
  const M = areaM2 * mat.weightPerM2New * factor;
  // Per-material product life = projectLife / (ownUpdate+1); surface layers
  // that refresh more often are penalised through X = L / Lav.
  const L = template.projectLifeYears / factor;
  const X = Lav > 0 ? L / Lav : 0;

  const FR = mat.fr ?? 0;
  const FRR = mat.frr ?? template.FRR;
  const CR = mat.cr ?? template.CR;
  const downcycle = mat.downcycle ?? c.downcycle;
  const lightweight = mat.lightweight ?? c.lightweight;

  const V = Math.max(0, M * (1 - FU - FRR - FR));
  const Wo = Math.max(0, M * (1 - template.CU - CR));
  const WF = template.EF > 0 ? (M * FR * (1 - template.EF)) / template.EF : 0;
  const WC = M * CR * (1 - template.EC_efficiency);
  const W = Wo + (WF + WC) / 2;
  const denom = 2 * M + (WF - WC) / 2;
  const LFI = denom > 0 ? (V + W) / denom : 0;
  const Level = downcycle === 'Y' ? 0.8 : 1;
  const Re = lightweight === 'Y' ? 0.9 : 1;
  const ELFI = Level > 0 ? (LFI * Re) / Level : 0;
  const FX = X > 0 ? 0.9 / X : 0;
  // EMF clamp: MCI ∈ [0, 1] per the EMF Material Circularity Indicator paper.
  const MCI = X > 0 ? Math.max(0, 1 - ELFI * FX) : 0;
  return { M, V, Wo, WF, WC, W, LFI, ELFI, MCI };
}

export function computeFloorElement(
  el: FloorElement,
  template: FloorsTemplate,
  buildingClassName: string,
): ElementResult {
  const c = findConstruction(template, el.constructionType);
  const baseline = findConstruction(template, template.baselineConstruction);
  const cls = template.buildingClasses.includes(buildingClassName)
    ? buildingClassName
    : template.defaultBuildingClass;

  const byClass = c.byClass[cls] ?? { totalWeightPerM2: 0, totalECPerM2: 0, baseUpdateCount: 0, surfaceUpdateCount: 0 };
  const baselineByClass = baseline.byClass[cls] ?? byClass;

  const FU = el.reused ? 1 : 0;
  const FRR = template.FRR;
  // FR: spreadsheet uses per-class table; we default to 0 if not in template
  const FR = el.greenRecycled ? 0 : 0;
  const CI_CON = FU + FRR + FR;

  const baseUpdates = byClass.baseUpdateCount;
  const surfaceUpdates = byClass.surfaceUpdateCount;
  // Lav is the baseline construction's surface-layer life for this class,
  // i.e. projectLife / (baseline.surfaceUpdate + 1). All materials' X are
  // judged against the baseline cladding's surface refresh cycle.
  const Lav = template.projectLifeYears / (baselineByClass.surfaceUpdateCount + 1);
  const layerLife = template.projectLifeYears / (baseUpdates + 1);
  const productLife = layerLife;
  const CI_USE = Lav === 0 ? 0 : productLife / Lav;

  const CU = template.CU;
  const CR = template.CR;
  const CI_EOL = CU + CR;

  let M: number, V: number, Wo: number, WF: number, WC: number, W: number;
  let LFI: number, ELFI: number, MCIp: number;

  if (c.materials && c.materials.length > 0) {
    // Sub-material path: aggregate per-material MCI by mass.
    const rows = c.materials.map((m) =>
      materialMCI(m, c, template, el.areaM2, baseUpdates, surfaceUpdates, FU, Lav),
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
    M = el.areaM2 * byClass.totalWeightPerM2;
    V = M * (1 - CI_CON);
    Wo = M * (1 - CI_EOL);
    WF = (M * FR * (1 - template.EF)) / template.EF;
    WC = M * CR * (1 - template.EC_efficiency);
    W = Wo + (WF + WC) / 2;
    LFI = (V + W) / (2 * M + (WF - WC) / 2);
    const lightweightFactor = c.lightweight === 'Y' ? 0.9 : 1;
    const downcycleFactor = c.downcycle === 'Y' ? 0.8 : 1;
    ELFI = (LFI * lightweightFactor) / downcycleFactor;
    // EMF clamp: MCI ∈ [0, 1] per the EMF Material Circularity Indicator paper.
    MCIp = CI_USE === 0 ? 0 : Math.max(0, 1 - (0.9 * ELFI) / CI_USE);
  }

  const componentDetachFactor = c.componentDetachable === 'N' ? 0.8 : 1;
  const modularFactor = el.prefabModular ? 1.1 : 1;
  const PCI = MCIp * componentDetachFactor * modularFactor;
  const systemDetachFactor = c.systemDetachable === 'N' ? 0.9 : 1;
  const SCIp = PCI * systemDetachFactor;

  const baselineEC = el.areaM2 * baselineByClass.totalECPerM2;
  const designEC = el.areaM2 * byClass.totalECPerM2;
  const reduction = designEC - baselineEC;
  const reductionRatio = baselineEC === 0 ? 0 : reduction / baselineEC;

  const b = singleBucket(c.name, M);
  const waste = computeWaste(b, el.greenDemolition, c.name);
  // Base + surface updates are already folded into totalWeightPerM2 etc. by
  // the template's byClass table — mirror that by scaling the unit price by
  // the same lifecycle factor.
  const lifecycleFactor = baseUpdates + 1;
  const cost = el.areaM2 * lifecycleFactor * (c.unitPrice ?? 0);
  // Floors → LCC 內裝層,壽命 20 年
  const lcc = computeLCC(waste, el.greenDemolition, '內裝');
  return {
    M,
    massMineral: b.massMineral, massMetal: b.massMetal, massGlass: b.massGlass,
    massWood: b.massWood, massPlastic: b.massPlastic, massOther: b.massOther,
    ...waste,
    CI_CON, CI_USE, CI_EOL, V, Wo, WF, WC, W, LFI, ELFI,
    MCIp, PCI, SCIp,
    baselineEC, designEC, reduction, reductionRatio,
    cost,
    lccC1: lcc.C1,
    lccC2: lcc.C2t + lcc.C2p,
    lccD: lcc.D,
    lccNominal: lcc.nominal,
    lccPV: lcc.PV,
  };
}
