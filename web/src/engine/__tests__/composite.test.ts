import { describe, expect, it } from 'vitest';
import claddingJson from '../../templates/RC/cladding.json';
import {
  computeAreaElement,
  type AreaElement,
  type CompositeTemplate,
} from '../composite';

const template = claddingJson as unknown as CompositeTemplate;

const closeTo = (a: number, b: number, d = 6) => expect(a).toBeCloseTo(b, d);

describe('computeAreaElement (2-2 外牆外裝)', () => {
  it('baseline construction gives 0 reduction, matches tabulated weight+EC', () => {
    const el: AreaElement = {
      id: 'a',
      areaM2: 10,
      constructionType: template.baselineConstruction,
      reused: false,
      greenRecycled: false,
      prefabModular: false,
      greenDemolition: false,
    };
    const r = computeAreaElement(el, template);
    // Baseline row 10 of 材料參數: weightPerM2 = 90.8, designECPerM2 = 48.35
    closeTo(r.M, 10 * 90.8);
    // Composite engine assigns the whole mass to a single material bucket via
    // name-based classifier; the sum across buckets must still equal M.
    closeTo(
      r.massMineral + r.massMetal + r.massGlass + r.massWood + r.massPlastic + r.massOther,
      r.M,
    );
    closeTo(r.baselineEC, 10 * 48.35);
    closeTo(r.designEC, 10 * 48.35);
    closeTo(r.reduction, 0);
    closeTo(r.reductionRatio, 0);
    // CI_CON = 0 (reused=F, greenRecycled=F → FR=0)
    closeTo(r.CI_CON, 0);
    // CI_USE = productLife / layerLife = (60/(1+1)) / 30 = 30/30 = 1
    closeTo(r.CI_USE, 1);
  });

  it('switching to 預鑄乾式 reduces EC and adjusts CI', () => {
    const el: AreaElement = {
      id: 'a',
      areaM2: 10,
      constructionType: '預鑄乾式RC外牆(免砂漿粉刷)塗料外裝',
      reused: false,
      greenRecycled: false,
      prefabModular: true, // modular bonus applies
      greenDemolition: false,
    };
    const r = computeAreaElement(el, template);
    // Design EC per m² for this construction: 22.84 (from material params row 23)
    closeTo(r.designEC, 10 * 22.84);
    // Baseline EC uses row 18 (基準): 48.35 per m²
    closeTo(r.baselineEC, 10 * 48.35);
    // Design < baseline → reductionRatio < 0
    expect(r.reduction).toBeLessThan(0);
    expect(r.reductionRatio).toBeLessThan(0);
    // PCI should include *1.1 modular bonus
    // Expected PCI = MCIp * componentDetachFactor * 1.1 ; construction says componentDetachable=Y → factor=1
    closeTo(r.PCI, r.MCIp * 1 * 1.1);
  });

  it('reused flag pushes CI_CON above 1 (model follows spreadsheet)', () => {
    const el: AreaElement = {
      id: 'a',
      areaM2: 5,
      constructionType: template.baselineConstruction,
      reused: true,
      greenRecycled: false,
      prefabModular: false,
      greenDemolition: false,
    };
    const r = computeAreaElement(el, template);
    closeTo(r.CI_CON, 1); // FU=1 + FRR=0 + FR=0
  });

  it('throws on unknown construction', () => {
    expect(() =>
      computeAreaElement(
        {
          id: 'a',
          areaM2: 1,
          constructionType: 'NOT-A-REAL-CONSTRUCTION',
          reused: false,
          greenRecycled: false,
          prefabModular: false,
          greenDemolition: false,
        },
        template,
      ),
    ).toThrow();
  });
});
