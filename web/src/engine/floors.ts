/**
 * Floors engine (3-2 地坪). Per-construction per-building-class pre-computed
 * total weight and EC (table already accounts for base + surface replacements
 * over the project lifecycle).
 */
import type { ElementResult, YN } from './types';
import { singleBucket } from './materialClassify';
import { computeWaste } from './waste';
import { computeLCC } from './lcc';

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

  const M = el.areaM2 * byClass.totalWeightPerM2;

  const FU = el.reused ? 1 : 0;
  const FRR = template.FRR;
  // FR: spreadsheet uses per-class table; we default to 0 if not in template
  const FR = el.greenRecycled ? 0 : 0;
  const CI_CON = FU + FRR + FR;

  const baseUpdates = byClass.baseUpdateCount;
  const layerLife = template.projectLifeYears / (baseUpdates + 1);
  const productLife = layerLife;
  const CI_USE = layerLife === 0 ? 0 : productLife / layerLife;

  const CU = template.CU;
  const CR = template.CR;
  const CI_EOL = CU + CR;

  const V = M * (1 - CI_CON);
  const Wo = M * (1 - CI_EOL);
  const WF = (M * FR * (1 - template.EF)) / template.EF;
  const WC = M * CR * (1 - template.EC_efficiency);
  const W = Wo + (WF + WC) / 2;

  const LFI = (V + W) / (2 * M + (WF - WC) / 2);
  const lightweightFactor = c.lightweight === 'Y' ? 0.9 : 1;
  const downcycleFactor = c.downcycle === 'Y' ? 0.8 : 1;
  const ELFI = (LFI * lightweightFactor) / downcycleFactor;

  const MCIp = CI_USE === 0 ? 0 : 1 - (0.9 * ELFI) / CI_USE;
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
