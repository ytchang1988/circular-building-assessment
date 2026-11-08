/**
 * Unit tests for `computeColumnElement`. Expected values are hand-derived
 * from the spreadsheet formula text (see `1-1_RC結構柱.xlsx :: CI&EC計算`)
 * because the live xlsx contains Google-Sheets-only ARRAYFORMULA / BYROW /
 * LAMBDA wrappers that can't be evaluated outside Google Sheets.
 */

import { describe, expect, it } from 'vitest';
import rcColumnsTemplate from '../../templates/RC/columns.json';
import { aggregateBuilding, aggregateComponent } from '../aggregate';
import { computeColumnElement, type RCColumnsTemplate } from '../columns';
import type { ColumnElement } from '../types';

const template = rcColumnsTemplate as unknown as RCColumnsTemplate;

const closeTo = (actual: number, expected: number, digits = 6) => {
  expect(actual).toBeCloseTo(expected, digits);
};

describe('computeColumnElement', () => {
  it('matches hand-derived values for 350kgf/cm² + 20% admixture, V=1m³, no overrides', () => {
    const el: ColumnElement = {
      id: 'a',
      volumeM3: 1,
      concreteStrength: '結構用混凝土，預拌，350kgf/cm2',
      admixturePct: 0.2,
      reused: false,
      prefabModular: false,
      greenDemolition: false,
    };
    const r = computeColumnElement(el, template);

    // Densities: concrete 2400 + rebar 314 = 2714.
    closeTo(r.M, 2714);
    closeTo(r.massMineral, 2400);
    closeTo(r.massMetal, 314);
    // RC mono: glass/wood/plastic/other are always 0; invariant holds across all 6
    closeTo(r.massGlass, 0);
    closeTo(r.massWood, 0);
    closeTo(r.massPlastic, 0);
    closeTo(r.massOther, 0);
    closeTo(
      r.massMineral + r.massMetal + r.massGlass + r.massWood + r.massPlastic + r.massOther,
      r.M,
    );
    // FU=0, FRR=0, FR=(2400*0.0375 + 314*0.8)/2714 = (90+251.2)/2714 = 341.2/2714.
    closeTo(r.CI_CON, 341.2 / 2714);
    closeTo(r.CI_USE, 1);
    // CR = (2400*0.75 + 314*0.9)/2714 = (1800+282.6)/2714 = 2082.6/2714.
    closeTo(r.CI_EOL, 2082.6 / 2714);
    closeTo(r.V, 2714 - 341.2); // M*(1-FR) = 2714 - 341.2 = 2372.8
    closeTo(r.Wo, 2714 - 2082.6); // = 631.4
    closeTo(r.WF, 341.2 * 0.1 / 0.9); // M*FR*(1-EF)/EF
    closeTo(r.WC, 2082.6 * 0.1); // M*CR*(1-EC) = 208.26
    closeTo(r.W, 631.4 + (341.2 * 0.1 / 0.9 + 208.26) / 2);

    // LFI = (V+W)/(2M + (WF-WC)/2)
    const expectedLFI =
      (r.V + r.W) / (2 * r.M + (r.WF - r.WC) / 2);
    closeTo(r.LFI, expectedLFI);
    // ELFI = LFI * (lightweight=N → 1) / (downcycle=Y → 0.8)
    closeTo(r.ELFI, expectedLFI / 0.8);
    // MCIp = 1 - 0.9 * ELFI / CI_USE
    closeTo(r.MCIp, 1 - (0.9 * (expectedLFI / 0.8)) / 1);
    // PCI = MCIp * 0.8 (componentDetachable=N) * 1 (modular=N)
    closeTo(r.PCI, r.MCIp * 0.8);
    // SCIp = PCI * 0.9 (systemDetachable=N)
    closeTo(r.SCIp, r.PCI * 0.9);

    // EC: rebar EC per m³ = 314 * 1.15 = 361.1
    closeTo(r.baselineEC, 511.29 + 361.1);
    closeTo(r.designEC, 433.695 + 361.1);
    closeTo(r.reduction, 433.695 - 511.29);
    closeTo(r.reductionRatio, (433.695 - 511.29) / (511.29 + 361.1));

    // Cost = 1 m³ × 3,750 NT$/m³ (350 kgf) + 314 kg × 18.9 NT$/kg
    //      = 3,750 + 5,934.6 = 9,684.6
    closeTo(r.cost, 1 * 3750 + 314 * 18.9);
  });

  it('handles reused + modular flags (no recycled concrete admixture)', () => {
    const el: ColumnElement = {
      id: 'a',
      volumeM3: 2,
      concreteStrength: '結構用混凝土，預拌，350kgf/cm2',
      admixturePct: 0,
      reused: true,
      prefabModular: true,
      greenDemolition: false,
    };
    const r = computeColumnElement(el, template);

    closeTo(r.M, 2 * 2714);
    // FU=1, FRR=0, FR=(2400*0 + 314*0.8)/2714 = 251.2/2714
    closeTo(r.CI_CON, 1 + 251.2 / 2714);
    // PCI applies *1.1 modular bonus
    closeTo(r.PCI, r.MCIp * 0.8 * 1.1);
    // 0% admixture means design EC == baseline EC for the same strength
    closeTo(r.reduction, 0);
    closeTo(r.reductionRatio, 0);
  });

  it('aggregates two elements with mass-weighted means', () => {
    const els: ColumnElement[] = [
      {
        id: 'a',
        volumeM3: 1,
        concreteStrength: '結構用混凝土，預拌，350kgf/cm2',
        admixturePct: 0.2,
        reused: false,
        prefabModular: false,
        greenDemolition: false,
      },
      {
        id: 'b',
        volumeM3: 3,
        concreteStrength: '結構用混凝土，預拌，280kgf/cm2',
        admixturePct: 0.3,
        reused: false,
        prefabModular: true,
        greenDemolition: false,
      },
    ];
    const results = els.map((e) => computeColumnElement(e, template));
    const comp = aggregateComponent(template.category, results);

    // Total mass = sum
    closeTo(comp.M, results[0].M + results[1].M);
    closeTo(comp.massMineral, results[0].massMineral + results[1].massMineral);
    closeTo(comp.massMetal, results[0].massMetal + results[1].massMetal);
    closeTo(comp.massMineral + comp.massMetal, comp.M);
    // Mass-weighted mean of CI_CON
    const totalM = results[0].M + results[1].M;
    const expectedCICON =
      (results[0].M * results[0].CI_CON + results[1].M * results[1].CI_CON) /
      totalM;
    closeTo(comp.CI_CON, expectedCICON);
    // EC sums straight
    closeTo(comp.baselineEC, results[0].baselineEC + results[1].baselineEC);
    closeTo(comp.designEC, results[0].designEC + results[1].designEC);

    // Building roll-up of a single component should match
    const bldg = aggregateBuilding([comp]);
    closeTo(bldg.BCI, comp.SCIp);
    closeTo(bldg.designEC, comp.designEC);
  });

  it('returns 0 ratios for an empty component', () => {
    const empty = aggregateComponent('RC結構柱', []);
    expect(empty.M).toBe(0);
    expect(empty.MCIp).toBe(0);
    expect(empty.reductionRatio).toBe(0);
  });

  it('throws on unknown concrete strength', () => {
    expect(() =>
      computeColumnElement(
        {
          id: 'a',
          volumeM3: 1,
          concreteStrength: 'NOT-A-REAL-STRENGTH',
          admixturePct: 0,
          reused: false,
          prefabModular: false,
          greenDemolition: false,
        },
        template,
      ),
    ).toThrow();
  });
});
