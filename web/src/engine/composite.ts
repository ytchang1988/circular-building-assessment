/**
 * Composite-surface engine for area-based categories where the user picks a
 * pre-bundled construction (e.g. RC外牆外裝). Weight, EC, and some flags come
 * from the construction; project/layer life and other constants are template
 * defaults.
 *
 * Variables follow the spreadsheet's naming (FU, FR, FRR, CR, CU, EF, EC)
 * so the math is auditable against `CI計算格式` + `CI&EC計算` sheets.
 */

import type { ElementResult, YN } from './types';
import { singleBucket } from './materialClassify';
import { computeWaste } from './waste';
import { computeLCC } from './lcc';

export interface CompositeConstruction {
  name: string;
  weightPerM2: number;        // M / area
  updateCount: number;        // c, used for productLife = 60 / (c + 1)
  frWhenGreen: number;        // FR applied when greenRecycled flag is true
  downcycle: YN;
  lightweight: YN;
  componentDetachable: YN;
  systemDetachable: YN;
  designECPerM2: number;      // kgCO2eq/m² for the design case
  /** NT$/m² assembled unit price from 營建物價 (per 工料類). */
  unitPrice?: number;
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

export function computeAreaElement(
  el: AreaElement,
  template: CompositeTemplate,
): ElementResult {
  const c = findConstruction(template, el.constructionType);
  const baseline = findConstruction(template, template.baselineConstruction);

  const M = el.areaM2 * c.weightPerM2;

  const FU = el.reused ? 1 : 0;
  const FRR = template.FRR;
  const FR = el.greenRecycled ? c.frWhenGreen : 0;
  const CI_CON = FU + FRR + FR;

  const productLife = template.projectLifeYears / (c.updateCount + 1);
  const CI_USE = productLife / template.layerLifeYears;

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
