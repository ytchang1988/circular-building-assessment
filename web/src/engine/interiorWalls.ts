/**
 * Interior walls engine (3-1 內牆). Area-based, construction type picks a
 * pre-bundled wall assembly. Project-level buildingClass picks the update
 * count c; the lifecycle total multiplies new weight/EC by (c+1).
 */
import type { ElementResult, YN } from './types';
import { singleBucket } from './materialClassify';
import { computeWaste } from './waste';
import { computeLCC } from './lcc';

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
  const M = el.areaM2 * lifecycleFactor * c.newWeightPerM2;

  const FU = el.reused ? 1 : 0;
  const FRR = template.FRR;
  const FR = el.greenRecycled ? c.frGreen : c.frNotGreen;
  const CI_CON = FU + FRR + FR;

  const layerLife = template.projectLifeYears / (updates + 1);
  const productLife = layerLife; // per spreadsheet V = I
  const CI_USE = layerLife === 0 ? 0 : productLife / layerLife; // = 1

  const CU = template.CU;
  const CR = c.cr;
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
