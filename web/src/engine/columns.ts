/**
 * RC Structural Column engine.
 * Direct 1:1 port of the formulas in `1-1_RC結構柱.xlsx` (sheets CI計算格式 +
 * CI&EC計算). Variables follow the spreadsheet column names (FU, FRR, FR, ...)
 * so the math is auditable line-by-line against the source model.
 */

import type {
  CategoryDefaults,
  ColumnElement,
  ConcreteMaterial,
  ElementResult,
  RebarMaterial,
} from './types';
import { computeWaste } from './waste';
import { computeLCC } from './lcc';

export interface RCColumnsTemplate {
  category: string;
  categoryEn: string;
  volumeUnit: string;
  rebarDefaultMassPerM3: number;
  defaults: CategoryDefaults;
  elementDefaults: Pick<
    ColumnElement,
    'concreteStrength' | 'admixturePct' | 'reused' | 'prefabModular'
  >;
  concreteMaterials: ConcreteMaterial[];
  rebarMaterials: RebarMaterial[];
  baselineConcreteEC: Record<string, number>;
}

const EPSILON = 1e-12;

function findConcrete(
  template: RCColumnsTemplate,
  strength: string,
  admixturePct: number,
): ConcreteMaterial {
  const m = template.concreteMaterials.find(
    (c) =>
      c.strength === strength &&
      Math.abs(c.admixturePct - admixturePct) < EPSILON,
  );
  if (!m) {
    throw new Error(
      `No concrete material for strength="${strength}" admixture=${admixturePct}`,
    );
  }
  return m;
}

function findRebar(
  template: RCColumnsTemplate,
  massPerM3: number,
): RebarMaterial {
  // Default lookup: nearest rebar entry (tolerance 1 kg/m³). Templates
  // sometimes store rounded defaults like 79 against entries of 78.5
  // (1% cross-section × 7,850 kg/m³ steel density).
  let best: RebarMaterial | undefined;
  let bestDiff = Infinity;
  for (const rb of template.rebarMaterials) {
    const d = Math.abs(rb.massPerM3 - massPerM3);
    if (d < bestDiff) { best = rb; bestDiff = d; }
  }
  if (!best || bestDiff > 1) {
    throw new Error(`No rebar material near mass=${massPerM3}`);
  }
  return best;
}

/**
 * Compute the CI / EC result for a single column element.
 *
 * Mirrors `CI&EC計算` row formulas:
 *   M       = volume * (concreteDensity + rebarMassPerM3)
 *   FU      = reused ? 1 : 0
 *   FRR     = defaults.FRR  (0 for columns)
 *   FR      = (concreteDensity * concreteRecycledRatio + rebarMassPerM3 * rebarRecycled)
 *               / (concreteDensity + rebarMassPerM3)
 *   CI_CON  = FU + FRR + FR
 *   CI_USE  = productLife / layerLife
 *   CU      = defaults.CU  (0 for columns)
 *   CR      = (concreteDensity * concreteRecyclable + rebarMassPerM3 * rebarRecyclable)
 *               / (concreteDensity + rebarMassPerM3)
 *   CI_EOL  = CU + CR
 *   V       = M * (1 - CI_CON)
 *   Wo      = M * (1 - CI_EOL)
 *   WF      = M * FR * (1 - EF) / EF
 *   WC      = M * CR * (1 - EC_efficiency)
 *   W       = Wo + (WF + WC) / 2
 *   LFI     = (V + W) / (2M + (WF - WC) / 2)
 *   ELFI    = LFI * (lightweight=Y ? 0.9 : 1) / (downcycle=Y ? 0.8 : 1)
 *   MCIp    = 1 - 0.9 * ELFI / CI_USE
 *   PCI     = MCIp * (componentDetachable=N ? 0.8 : 1) * (modular=Y ? 1.1 : 1)
 *   SCIp    = PCI * (systemDetachable=N ? 0.9 : 1)
 *   baselineEC = volume * (baselineConcreteEC[strength] + rebarMassPerM3 * rebarEC)
 *   designEC   = volume * (concrete.ecFactor + rebarMassPerM3 * rebarEC)
 *
 * Note: the modular flag comes from the element (預鑄工法或模矩化), all other
 * detachability / lightweight flags come from category defaults.
 */
export function computeColumnElement(
  el: ColumnElement,
  template: RCColumnsTemplate,
): ElementResult {
  const concrete = findConcrete(
    template,
    el.concreteStrength,
    el.admixturePct,
  );
  const rebar = findRebar(template, template.rebarDefaultMassPerM3);
  const d = template.defaults;

  const ρc = concrete.density;
  const ρr = rebar.massPerM3;
  const totalDensity = ρc + ρr;

  const massMineral = el.volumeM3 * ρc;
  const massMetal = el.volumeM3 * ρr;
  const M = massMineral + massMetal;

  const FU = el.reused ? 1 : 0;
  const FRR = d.FRR;
  const FR =
    (ρc * concrete.recycledRatio + ρr * rebar.recycledRatio) / totalDensity;
  const CI_CON = FU + FRR + FR;

  const CI_USE = d.productLifeYears / d.layerLifeYears;

  const CU = d.CU;
  const CR =
    (ρc * concrete.recyclableRatio + ρr * rebar.recyclableRatio) / totalDensity;
  const CI_EOL = CU + CR;

  const V = M * (1 - CI_CON);
  const Wo = M * (1 - CI_EOL);
  const WF = (M * FR * (1 - d.EF)) / d.EF;
  const WC = M * CR * (1 - d.EC_efficiency);
  const W = Wo + (WF + WC) / 2;

  const LFI = (V + W) / (2 * M + (WF - WC) / 2);

  const lightweightFactor = d.lightweight === 'Y' ? 0.9 : 1;
  const downcycleFactor = d.downcycle === 'Y' ? 0.8 : 1;
  const ELFI = (LFI * lightweightFactor) / downcycleFactor;

  // EMF clamp: MCI ∈ [0, 1] (short life / high ELFI can drive the raw value
  // below zero; cap at 0 per the EMF Material Circularity Indicator paper).
  const MCIp = Math.max(0, 1 - (0.9 * ELFI) / CI_USE);

  const componentDetachFactor = d.componentDetachable === 'N' ? 0.8 : 1;
  const modularFactor = el.prefabModular ? 1.1 : 1;
  const PCI = MCIp * componentDetachFactor * modularFactor;

  const systemDetachFactor = d.systemDetachable === 'N' ? 0.9 : 1;
  const SCIp = PCI * systemDetachFactor;

  const baselineConcreteEC = template.baselineConcreteEC[el.concreteStrength];
  if (baselineConcreteEC === undefined) {
    throw new Error(
      `No baseline EC for concrete strength "${el.concreteStrength}"`,
    );
  }
  const rebarECPerM3 = rebar.massPerM3 * rebar.ecFactor;
  const baselineEC = el.volumeM3 * (baselineConcreteEC + rebarECPerM3);
  const designEC = el.volumeM3 * (concrete.ecFactor + rebarECPerM3);
  const reduction = designEC - baselineEC;
  const reductionRatio = baselineEC === 0 ? 0 : reduction / baselineEC;

  // Cost = concrete volume × its NT$/m³ + rebar kg × its NT$/kg. Both default
  // to 0 if the template has no price seeded for this construction.
  const cost =
    el.volumeM3 * (concrete.unitPrice ?? 0) +
    massMetal * (rebar.unitPricePerKg ?? 0);

  const waste = computeWaste(
    {
      massMineral, massMetal,
      massGlass: 0, massWood: 0, massPlastic: 0, massOther: 0,
    },
    el.greenDemolition,
    '鋼筋', // rebar → iron
    true,  // structural RC → mineral (concrete) goes to B5
  );
  // Structural RC (柱/梁/樓版/外牆) → LCC 結構層,壽命 60 年
  const lcc = computeLCC(waste, el.greenDemolition, '結構');
  return {
    M,
    massMineral,
    massMetal,
    massGlass: 0,
    massWood: 0,
    massPlastic: 0,
    massOther: 0,
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
