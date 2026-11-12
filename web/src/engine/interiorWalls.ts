/**
 * Interior walls engine (3-1 內牆). Area-based, construction type picks a
 * pre-bundled wall assembly. Project-level buildingClass picks the update
 * count c; the lifecycle total multiplies new weight/EC by (c+1).
 *
 * Sub-material mode: when a construction declares `materials[]`, MCI is
 * computed per sub-material (with optional per-material FR/CR/downcycle/
 * lightweight overrides — e.g. rebar/furring at FR=0.80, CR=0.90) and
 * rolled up by mass-weighted mean, mirroring composite.ts. All materials
 * share the same lifecycle factor (updates + 1) since interior walls
 * refresh as one assembly.
 */
import type { ElementResult, YN } from './types';
import { singleBucket } from './materialClassify';
import { computeWaste } from './waste';
import { computeLCC } from './lcc';

export interface InteriorWallMaterial {
  name: string;
  /** Mass per m² for ONE build (not including updates). */
  weightPerM2New: number;
  /** Override construction FR (applied when greenRecycled is also false). */
  fr?: number;
  /** Rapid-renewable (biogenic) share — wood → 1.0; default 0. */
  frr?: number;
  /** Override construction CR. */
  cr?: number;
  /** Override construction downcycle flag. */
  downcycle?: YN;
  /** Override construction lightweight flag. */
  lightweight?: YN;
}

export interface InteriorWallConstruction {
  name: string;
  newWeightPerM2: number;
  newECPerM2: number;
  frNotGreen: number;
  frGreen: number;
  cr: number;
  downcycle: YN;
  lightweight: YN;
  componentDetachable: YN;
  systemDetachable: YN;
  /** NT$/m² assembled unit price from 營建物價 (per 工料類 隔間工程). Covers
   *  one build; lifecycle (updates+1) is applied when computing total cost. */
  unitPrice?: number;
  /** Optional sub-material composition. When present, MCI is aggregated. */
  materials?: InteriorWallMaterial[];
}

export interface InteriorWallsTemplate {
  category: string;
  categoryEn: string;
  unitSymbol: string;
  projectLifeYears: number;
  FRR: number;
  EF: number;
  CU: number;
  EC_efficiency: number;
  baselineConstruction: string;
  buildingClasses: Array<{ name: string; updateCount: number }>;
  defaultBuildingClass: string;
  constructions: InteriorWallConstruction[];
  elementDefaults: {
    constructionType: string;
    reused: boolean;
    greenRecycled: boolean;
    prefabModular: boolean;
  };
}

export interface InteriorWallElement {
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
  template: InteriorWallsTemplate,
  name: string,
): InteriorWallConstruction {
  const c = template.constructions.find((x) => x.name === name);
  if (!c) throw new Error(`Unknown interior wall construction "${name}"`);
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
  mat: InteriorWallMaterial,
  c: InteriorWallConstruction,
  template: InteriorWallsTemplate,
  areaM2: number,
  lifecycleFactor: number,
  FU: number,
  greenRecycled: boolean,
  L: number,
  Lav: number,
): MaterialMCI {
  const M = areaM2 * lifecycleFactor * mat.weightPerM2New;
  const FR = mat.fr !== undefined
    ? mat.fr
    : (greenRecycled ? c.frGreen : c.frNotGreen);
  const FRR = mat.frr ?? template.FRR;
  const CR = mat.cr !== undefined ? mat.cr : c.cr;
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
  const X = Lav > 0 ? L / Lav : 0;
  const FX = X > 0 ? 0.9 / X : 0;
  // EMF clamp: MCI ∈ [0, 1] per the EMF Material Circularity Indicator paper.
  const MCI = X > 0 ? Math.max(0, 1 - ELFI * FX) : 0;
  return { M, V, Wo, WF, WC, W, LFI, ELFI, MCI };
}

export function computeInteriorWallElement(
  el: InteriorWallElement,
  template: InteriorWallsTemplate,
  buildingClassName: string,
): ElementResult {
  const c = findConstruction(template, el.constructionType);
  const baseline = findConstruction(template, template.baselineConstruction);
  const cls = template.buildingClasses.find((b) => b.name === buildingClassName)
    ?? template.buildingClasses[template.buildingClasses.length - 1];
  const updates = cls.updateCount;

  const lifecycleFactor = updates + 1;

  const FU = el.reused ? 1 : 0;
  const FRR = template.FRR;
  const FR = el.greenRecycled ? c.frGreen : c.frNotGreen;
  const CI_CON = FU + FRR + FR;

  // Lav = baseline construction's layer life for this building class. In 3-1
  // the whole construction refreshes at buildingClass.updateCount, so Lav =
  // projectLife / (updates + 1); L per material currently equals Lav because
  // 3-1 has no base/surface split (X = 1). Structured this way so adding
  // layer attribution later lets X diverge.
  const Lav = template.projectLifeYears / (updates + 1);
  const materialL = template.projectLifeYears / (updates + 1);
  const layerLife = Lav;
  const productLife = layerLife;
  const CI_USE = Lav === 0 ? 0 : productLife / Lav; // = 1 today

  const CU = template.CU;
  const CR = c.cr;
  const CI_EOL = CU + CR;

  let M: number, V: number, Wo: number, WF: number, WC: number, W: number;
  let LFI: number, ELFI: number, MCIp: number;

  if (c.materials && c.materials.length > 0) {
    // Sub-material path: aggregate per-material MCI by mass.
    const rows = c.materials.map((m) =>
      materialMCI(m, c, template, el.areaM2, lifecycleFactor, FU, el.greenRecycled, materialL, Lav),
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
    M = el.areaM2 * lifecycleFactor * c.newWeightPerM2;
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

  const baselineEC = el.areaM2 * lifecycleFactor * baseline.newECPerM2;
  const designEC = el.areaM2 * lifecycleFactor * c.newECPerM2;
  const reduction = designEC - baselineEC;
  const reductionRatio = baselineEC === 0 ? 0 : reduction / baselineEC;

  const b = singleBucket(c.name, M);
  const waste = computeWaste(b, el.greenDemolition, c.name);
  const cost = el.areaM2 * lifecycleFactor * (c.unitPrice ?? 0);
  // Interior walls → LCC 內裝層,壽命 20 年
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
