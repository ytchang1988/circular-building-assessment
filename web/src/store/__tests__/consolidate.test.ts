/**
 * The consolidate operation must be mathematically lossless: merging rows with
 * identical merge-key inputs must produce identical aggregate BCI / EC.
 */
import { describe, expect, it } from 'vitest';
import {
  aggregateComponent,
  computeColumnElement,
  type RCColumnsTemplate,
} from '@/engine';
import rcColumnsTemplate from '@/templates/RC/columns.json';
import { useProject } from '@/store/project';
import type { ColumnElement } from '@/engine/types';

const template = rcColumnsTemplate as unknown as RCColumnsTemplate;

const build = (volumeM3: number, overrides: Partial<ColumnElement> = {}): ColumnElement => ({
  id: 'x',
  floor: '1F',
  family: '900x900',
  volumeM3,
  concreteStrength: '結構用混凝土，預拌，350kgf/cm2',
  admixturePct: 0.2,
  reused: false,
  prefabModular: false,
  greenDemolition: false,
  ...overrides,
});

const runAggregate = (els: ColumnElement[]) => {
  const results = els.map((e) => computeColumnElement(e, template));
  return aggregateComponent('RC結構柱', results);
};

describe('consolidateColumns', () => {
  it('merges identical rows and preserves aggregate BCI + EC', () => {
    const beforeEls: ColumnElement[] = [
      build(2.75, { id: 'a' }),
      build(2.75, { id: 'b' }),
      build(3.31, { id: 'c' }),
      // A different family — must not merge with above
      build(1.5, { id: 'd', family: '600x600' }),
    ];
    const beforeAgg = runAggregate(beforeEls);

    // Hydrate store and consolidate (columns category)
    useProject.setState((s) => ({
      elements: { ...s.elements, columns: beforeEls },
    }));
    const { before, after } = useProject.getState().consolidateElements('columns');
    const afterEls = useProject.getState().elements.columns;

    expect(before).toBe(4);
    expect(after).toBe(2); // all three 900x900 merge (volume differs but key doesn't)
    const merged = afterEls.find((e) => e.family === '900x900');
    expect(merged?.volumeM3).toBeCloseTo(2.75 + 2.75 + 3.31, 6);
    expect(merged?.note).toBe('×3');

    const afterAgg = runAggregate(afterEls);
    expect(afterAgg.M).toBeCloseTo(beforeAgg.M, 6);
    expect(afterAgg.MCIp).toBeCloseTo(beforeAgg.MCIp, 10);
    expect(afterAgg.SCIp).toBeCloseTo(beforeAgg.SCIp, 10);
    expect(afterAgg.baselineEC).toBeCloseTo(beforeAgg.baselineEC, 6);
    expect(afterAgg.designEC).toBeCloseTo(beforeAgg.designEC, 6);
  });

  it('does not merge rows that differ in admixture or reused flag', () => {
    const els: ColumnElement[] = [
      build(1, { id: 'a', admixturePct: 0.2 }),
      build(1, { id: 'b', admixturePct: 0.3 }),
      build(1, { id: 'c', admixturePct: 0.2, reused: true }),
    ];
    useProject.setState((s) => ({
      elements: { ...s.elements, columns: els },
    }));
    const { before, after } = useProject.getState().consolidateElements('columns');
    expect(before).toBe(3);
    expect(after).toBe(3);
  });

  it('is a no-op on already-unique rows', () => {
    const els: ColumnElement[] = [
      build(1, { id: 'a', family: 'A' }),
      build(1, { id: 'b', family: 'B' }),
    ];
    useProject.setState((s) => ({
      elements: { ...s.elements, columns: els },
    }));
    const { before, after } = useProject.getState().consolidateElements('columns');
    expect(before).toBe(2);
    expect(after).toBe(2);
  });

  it('clearElements empties the list', () => {
    useProject.setState((s) => ({
      elements: { ...s.elements, columns: [build(1), build(2)] },
    }));
    useProject.getState().clearElements('columns');
    expect(useProject.getState().elements.columns).toEqual([]);
  });
});

describe('consolidateAreaElements (cladding)', () => {
  const area = (areaM2: number, over: Record<string, unknown> = {}) => ({
    id: 'x', floor: '1F', family: 'W-A', areaM2,
    constructionType: '基準RC外牆+水泥砂漿粉刷+塗料',
    reused: false, greenRecycled: false, prefabModular: false,
    greenDemolition: false, ...over,
  });

  it('merges identical area rows, summing area', () => {
    const els = [
      area(10, { id: 'a' }),
      area(15, { id: 'b' }),
      area(5, { id: 'c', family: 'W-B' }), // different family — stays
    ];
    useProject.setState((s) => ({
      areaElements: { ...s.areaElements, cladding: els },
    }));
    const { before, after } = useProject.getState().consolidateAreaElements('cladding');
    expect(before).toBe(3);
    expect(after).toBe(2);
    const merged = useProject.getState().areaElements.cladding.find((e) => e.family === 'W-A');
    expect(merged?.areaM2).toBeCloseTo(25, 6);
    expect(merged?.note).toBe('×2');
  });

  it('does not merge rows that differ in greenRecycled flag', () => {
    const els = [
      area(10, { id: 'a', greenRecycled: false }),
      area(10, { id: 'b', greenRecycled: true }),
    ];
    useProject.setState((s) => ({
      areaElements: { ...s.areaElements, cladding: els },
    }));
    const { before, after } = useProject.getState().consolidateAreaElements('cladding');
    expect(before).toBe(2);
    expect(after).toBe(2);
  });
});

describe('consolidateWindowElements', () => {
  it('merges identical window rows, summing area', () => {
    const win = (areaM2: number, over: Record<string, unknown> = {}) => ({
      id: 'x', floor: '1F', family: 'WIN-A', areaM2,
      glass: 'G1', frame: 'F1', reused: false, prefabModular: false,
      greenDemolition: false, ...over,
    });
    const els = [
      win(2, { id: 'a' }),
      win(3, { id: 'b' }),
      win(1, { id: 'c', frame: 'F2' }), // different frame
    ];
    useProject.setState({ windowElements: els as never });
    const { before, after } = useProject.getState().consolidateWindowElements();
    expect(before).toBe(3);
    expect(after).toBe(2);
    const merged = useProject.getState().windowElements.find((e) => e.frame === 'F1');
    expect(merged?.areaM2).toBeCloseTo(5, 6);
  });
});

describe('consolidateLifecycleElements (interior walls)', () => {
  it('merges identical interior-wall rows by categorical fields', () => {
    const iw = (areaM2: number, over: Record<string, unknown> = {}) => ({
      id: 'x', floor: '1F', family: 'IW-A', areaM2,
      constructionType: 'RC+水泥砂漿粉刷+塗料',
      reused: false, greenRecycled: false, prefabModular: false,
      greenDemolition: false, ...over,
    });
    const els = [iw(8, { id: 'a' }), iw(12, { id: 'b' })];
    useProject.setState((s) => ({
      lifecycleElements: { ...s.lifecycleElements, interiorWalls: els as never },
    }));
    const { before, after } =
      useProject.getState().consolidateLifecycleElements('interiorWalls');
    expect(before).toBe(2);
    expect(after).toBe(1);
    expect(useProject.getState().lifecycleElements.interiorWalls[0].areaM2).toBeCloseTo(20, 6);
  });
});
