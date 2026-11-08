/**
 * Aggregation: per-element → per-component → per-building.
 * Mirrors the `整體結果` sheets and `0_整體結果.xlsx :: 加總數據`.
 */

import type {
  BuildingResult,
  ComponentResult,
  ElementResult,
} from './types';

function safeRatio(num: number, denom: number): number {
  return denom === 0 ? 0 : num / denom;
}

/** Mass-weighted mean: Σ(M_i * x_i) / Σ(M_i). */
function massWeighted(
  results: ElementResult[],
  pick: (r: ElementResult) => number,
): number {
  const totalM = results.reduce((s, r) => s + r.M, 0);
  if (totalM === 0) return 0;
  const weighted = results.reduce((s, r) => s + r.M * pick(r), 0);
  return weighted / totalM;
}

export function aggregateComponent(
  category: string,
  results: ElementResult[],
): ComponentResult {
  const M = results.reduce((s, r) => s + r.M, 0);
  const massMineral = results.reduce((s, r) => s + r.massMineral, 0);
  const massMetal = results.reduce((s, r) => s + r.massMetal, 0);
  const massGlass = results.reduce((s, r) => s + r.massGlass, 0);
  const massWood = results.reduce((s, r) => s + r.massWood, 0);
  const massPlastic = results.reduce((s, r) => s + r.massPlastic, 0);
  const massOther = results.reduce((s, r) => s + r.massOther, 0);
  const wasteB5 = results.reduce((s, r) => s + r.wasteB5, 0);
  const wasteR1301 = results.reduce((s, r) => s + r.wasteR1301, 0);
  const wasteR1304 = results.reduce((s, r) => s + r.wasteR1304, 0);
  const wasteR0401 = results.reduce((s, r) => s + r.wasteR0401, 0);
  const wasteR0701 = results.reduce((s, r) => s + r.wasteR0701, 0);
  const wasteR0201 = results.reduce((s, r) => s + r.wasteR0201, 0);
  const wasteR0503 = results.reduce((s, r) => s + r.wasteR0503, 0);
  const baselineEC = results.reduce((s, r) => s + r.baselineEC, 0);
  const designEC = results.reduce((s, r) => s + r.designEC, 0);
  const reduction = designEC - baselineEC;
  const cost = results.reduce((s, r) => s + r.cost, 0);
  const lccC1 = results.reduce((s, r) => s + r.lccC1, 0);
  const lccC2 = results.reduce((s, r) => s + r.lccC2, 0);
  const lccD = results.reduce((s, r) => s + r.lccD, 0);
  const lccNominal = results.reduce((s, r) => s + r.lccNominal, 0);
  const lccPV = results.reduce((s, r) => s + r.lccPV, 0);
  return {
    category,
    elementCount: results.length,
    M,
    massMineral,
    massMetal,
    massGlass,
    massWood,
    massPlastic,
    massOther,
    wasteB5,
    wasteR1301, wasteR1304,
    wasteR0401, wasteR0701,
    wasteR0201, wasteR0503,
    CI_CON: massWeighted(results, (r) => r.CI_CON),
    CI_USE: massWeighted(results, (r) => r.CI_USE),
    CI_EOL: massWeighted(results, (r) => r.CI_EOL),
    MCIp: massWeighted(results, (r) => r.MCIp),
    PCI: massWeighted(results, (r) => r.PCI),
    SCIp: massWeighted(results, (r) => r.SCIp),
    baselineEC,
    designEC,
    reduction,
    reductionRatio: safeRatio(reduction, baselineEC),
    cost,
    lccC1, lccC2, lccD, lccNominal, lccPV,
  };
}

/** Treat each component as one mass-weighted "row" in the building roll-up. */
export function aggregateBuilding(
  components: ComponentResult[],
): BuildingResult {
  const M = components.reduce((s, c) => s + c.M, 0);
  const massMineral = components.reduce((s, c) => s + c.massMineral, 0);
  const massMetal = components.reduce((s, c) => s + c.massMetal, 0);
  const massGlass = components.reduce((s, c) => s + c.massGlass, 0);
  const massWood = components.reduce((s, c) => s + c.massWood, 0);
  const massPlastic = components.reduce((s, c) => s + c.massPlastic, 0);
  const massOther = components.reduce((s, c) => s + c.massOther, 0);
  const wasteB5 = components.reduce((s, c) => s + c.wasteB5, 0);
  const wasteR1301 = components.reduce((s, c) => s + c.wasteR1301, 0);
  const wasteR1304 = components.reduce((s, c) => s + c.wasteR1304, 0);
  const wasteR0401 = components.reduce((s, c) => s + c.wasteR0401, 0);
  const wasteR0701 = components.reduce((s, c) => s + c.wasteR0701, 0);
  const wasteR0201 = components.reduce((s, c) => s + c.wasteR0201, 0);
  const wasteR0503 = components.reduce((s, c) => s + c.wasteR0503, 0);
  const baselineEC = components.reduce((s, c) => s + c.baselineEC, 0);
  const designEC = components.reduce((s, c) => s + c.designEC, 0);
  const reduction = designEC - baselineEC;
  const cost = components.reduce((s, c) => s + c.cost, 0);
  const lccC1 = components.reduce((s, c) => s + c.lccC1, 0);
  const lccC2 = components.reduce((s, c) => s + c.lccC2, 0);
  const lccD = components.reduce((s, c) => s + c.lccD, 0);
  const lccNominal = components.reduce((s, c) => s + c.lccNominal, 0);
  const lccPV = components.reduce((s, c) => s + c.lccPV, 0);

  const wmean = (pick: (c: ComponentResult) => number): number => {
    if (M === 0) return 0;
    return components.reduce((s, c) => s + c.M * pick(c), 0) / M;
  };

  return {
    components,
    M,
    massMineral,
    massMetal,
    massGlass,
    massWood,
    massPlastic,
    massOther,
    wasteB5,
    wasteR1301, wasteR1304,
    wasteR0401, wasteR0701,
    wasteR0201, wasteR0503,
    CI_CON: wmean((c) => c.CI_CON),
    CI_USE: wmean((c) => c.CI_USE),
    CI_EOL: wmean((c) => c.CI_EOL),
    MCIp: wmean((c) => c.MCIp),
    PCI: wmean((c) => c.PCI),
    BCI: wmean((c) => c.SCIp),
    baselineEC,
    designEC,
    reduction,
    reductionRatio: safeRatio(reduction, baselineEC),
    cost,
    lccC1, lccC2, lccD, lccNominal, lccPV,
  };
}
