/**
 * Windows engine (2-3 RC外窗). User picks a (glass, frame) combination; the
 * material table has one row per combo with pre-computed total weight/EC.
 */
import type { ElementResult, YN } from './types';
import { classifyMaterial, emptyBreakdown } from './materialClassify';
import { computeWaste } from './waste';
import { computeLCC } from './lcc';

export interface WindowCombo {
  glass: string;
  frame: string;
  totalWeightPerM2: number;
  totalECPerM2: number;
  updateCount: number;
  FRR: number;
  FR: number;
  CR: number;
  downcycle: YN;
  lightweight: YN;
  componentDetachable: YN;
  systemDetachable: YN;
  /** NT$/m² of window area (glass + frame + install, assembled). */
  unitPrice?: number;
}

export interface WindowsTemplate {
  category: string;
  categoryEn: string;
  unitSymbol: string;
  projectLifeYears: number;
  layerLifeYears: number;
  EF: number;
  CU: number;
  EC_efficiency: number;
  baselineFrame: string;
  glasses: string[];
  frames: string[];
  combos: WindowCombo[];
  elementDefaults: {
    glass: string;
    frame: string;
    reused: boolean;
    prefabModular: boolean;
  };
}

export interface WindowElement {
  id: string;
  floor?: string;
  family?: string;
  areaM2: number;
  note?: string;
  glass: string;
  frame: string;
  reused: boolean;
  prefabModular: boolean;
  greenDemolition: boolean;
}

function findCombo(
  template: WindowsTemplate,
  glass: string,
  frame: string,
): WindowCombo {
  const c = template.combos.find(
    (x) => x.glass === glass && x.frame === frame,
  );
  if (!c) throw new Error(`No window combo for glass="${glass}" frame="${frame}"`);
  return c;
}

export function computeWindowElement(
  el: WindowElement,
  template: WindowsTemplate,
): ElementResult {
  const combo = findCombo(template, el.glass, el.frame);
  const baseline = findCombo(template, el.glass, template.baselineFrame);

  const M = el.areaM2 * combo.totalWeightPerM2;

  const FU = el.reused ? 1 : 0;
  const FRR = combo.FRR;
  const FR = combo.FR;
  const CI_CON = FU + FRR + FR;

  const productLife = template.projectLifeYears / (combo.updateCount + 1);
  const CI_USE = productLife / template.layerLifeYears;

  const CU = template.CU;
  const CR = combo.CR;
  const CI_EOL = CU + CR;

  const V = M * (1 - CI_CON);
  const Wo = M * (1 - CI_EOL);
  const WF = (M * FR * (1 - template.EF)) / template.EF;
  const WC = M * CR * (1 - template.EC_efficiency);
  const W = Wo + (WF + WC) / 2;

  const LFI = (V + W) / (2 * M + (WF - WC) / 2);
  const lightweightFactor = combo.lightweight === 'Y' ? 0.9 : 1;
  const downcycleFactor = combo.downcycle === 'Y' ? 0.8 : 1;
  const ELFI = (LFI * lightweightFactor) / downcycleFactor;

  // EMF clamp: MCI ∈ [0, 1] (short life / high ELFI can push the raw value
  // below zero; cap at 0 per the EMF Material Circularity Indicator paper).
  const MCIp = CI_USE === 0 ? 0 : Math.max(0, 1 - (0.9 * ELFI) / CI_USE);
  const componentDetachFactor = combo.componentDetachable === 'N' ? 0.8 : 1;
  const modularFactor = el.prefabModular ? 1.1 : 1;
  const PCI = MCIp * componentDetachFactor * modularFactor;
  const systemDetachFactor = combo.systemDetachable === 'N' ? 0.9 : 1;
  const SCIp = PCI * systemDetachFactor;

  const baselineEC = el.areaM2 * baseline.totalECPerM2;
  const designEC = el.areaM2 * combo.totalECPerM2;
  const reduction = designEC - baselineEC;
  const reductionRatio = baselineEC === 0 ? 0 : reduction / baselineEC;

  // Windows mass split: glass ≈ 70%, frame ≈ 30% (coarse default, template
  // data does not carry per-material weights yet). Frame material comes from
  // the frame-name classifier (aluminum → metal, wood → wood, etc.).
  const breakdown = emptyBreakdown();
  breakdown.massGlass = M * 0.7;
  const frameBucket = classifyMaterial(el.frame);
  breakdown[frameBucket] += M * 0.3;
  const waste = computeWaste(breakdown, el.greenDemolition, el.frame);
  const cost = el.areaM2 * (combo.unitPrice ?? 0);
  // Windows → LCC 外裝層,壽命 30 年
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
