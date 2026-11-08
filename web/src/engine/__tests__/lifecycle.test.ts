import { describe, expect, it } from 'vitest';
import interiorJson from '../../templates/RC/interior_walls.json';
import floorsJson from '../../templates/RC/floors.json';
import {
  computeInteriorWallElement, type InteriorWallsTemplate,
} from '../interiorWalls';
import { computeFloorElement, type FloorsTemplate } from '../floors';

const iwTpl = interiorJson as unknown as InteriorWallsTemplate;
const flTpl = floorsJson as unknown as FloorsTemplate;
const closeTo = (a: number, b: number, d = 6) => expect(a).toBeCloseTo(b, d);

describe('interior walls (3-1)', () => {
  it('low-loss building: updateCount=0, so mass = area × newWeight', () => {
    const lowClass = iwTpl.buildingClasses.find((b) => b.updateCount === 0)!;
    const baseline = iwTpl.constructions.find((c) => c.name === iwTpl.baselineConstruction)!;
    const r = computeInteriorWallElement(
      {
        id: 'a', areaM2: 5,
        constructionType: iwTpl.baselineConstruction,
        reused: false, greenRecycled: false, prefabModular: false,
        greenDemolition: false,
      },
      iwTpl,
      lowClass.name,
    );
    closeTo(r.M, 5 * (lowClass.updateCount + 1) * baseline.newWeightPerM2);
    closeTo(r.baselineEC, r.designEC); // same construction = baseline
  });

  it('high-loss building triples mass vs low (updateCount 2 vs 0)', () => {
    const low = iwTpl.buildingClasses.find((b) => b.updateCount === 0)!;
    const high = iwTpl.buildingClasses.find((b) => b.updateCount === 2)!;
    const el = {
      id: 'a', areaM2: 1,
      constructionType: iwTpl.baselineConstruction,
      reused: false, greenRecycled: false, prefabModular: false,
      greenDemolition: false,
    };
    const r_low = computeInteriorWallElement(el, iwTpl, low.name);
    const r_high = computeInteriorWallElement(el, iwTpl, high.name);
    closeTo(r_high.M / r_low.M, 3); // (2+1)/(0+1)
  });

  it('green recycled flag changes FR → changes CI_CON', () => {
    const low = iwTpl.buildingClasses.find((b) => b.updateCount === 0)!;
    const notGreen = computeInteriorWallElement(
      {
        id: 'a', areaM2: 1, constructionType: iwTpl.baselineConstruction,
        reused: false, greenRecycled: false, prefabModular: false,
        greenDemolition: false,
      }, iwTpl, low.name,
    );
    const green = computeInteriorWallElement(
      {
        id: 'a', areaM2: 1, constructionType: iwTpl.baselineConstruction,
        reused: false, greenRecycled: true, prefabModular: false,
        greenDemolition: false,
      }, iwTpl, low.name,
    );
    expect(green.CI_CON).toBeGreaterThan(notGreen.CI_CON);
  });
});

describe('floors (3-2)', () => {
  it('baseline construction gives zero reduction for same class', () => {
    const cls = flTpl.defaultBuildingClass;
    const r = computeFloorElement(
      {
        id: 'a', areaM2: 10,
        constructionType: flTpl.baselineConstruction,
        reused: false, greenRecycled: false, prefabModular: false,
        greenDemolition: false,
      },
      flTpl,
      cls,
    );
    closeTo(r.reduction, 0);
  });

  it('different construction can reduce EC', () => {
    const cls = flTpl.defaultBuildingClass;
    // Find a construction that isn't baseline
    const other = flTpl.constructions.find((c) => c.name !== flTpl.baselineConstruction)!;
    const r = computeFloorElement(
      {
        id: 'a', areaM2: 1,
        constructionType: other.name,
        reused: false, greenRecycled: false, prefabModular: false,
        greenDemolition: false,
      }, flTpl, cls,
    );
    expect(r.designEC).toBeGreaterThanOrEqual(0);
    expect(r.baselineEC).toBeGreaterThan(0);
  });
});
