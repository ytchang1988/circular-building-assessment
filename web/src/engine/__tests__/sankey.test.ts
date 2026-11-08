import { describe, expect, it } from 'vitest';
import { buildSankeyFlows, routeMaterial } from '../sankey';
import type { ElementResult } from '../types';

function emptyResult(mass: Partial<ElementResult>): ElementResult {
  return {
    massMineral: 0, massMetal: 0, massGlass: 0,
    massWood: 0, massPlastic: 0, massOther: 0,
    wasteB5: 0, wasteR1301: 0, wasteR1304: 0,
    wasteR0401: 0, wasteR0701: 0, wasteR0201: 0, wasteR0503: 0,
    M: 0, FU: 0, FRR: 0, FR: 0, CU: 0, CR: 0, EF: 0, EC: 0,
    LFI: 0, ELFI: 0,
    CI_CON: 0, CI_USE: 0, CI_EOL: 0, MCIp: 0, PCI: 0, SCIp: 0,
    baselineEC: 0, designEC: 0, reduction: 0, reductionRatio: 0,
    ...mass,
  } as ElementResult;
}

describe('routeMaterial', () => {
  it('structural mineral always → B5', () => {
    expect(routeMaterial('massMineral', false, '鋼筋', true)).toBe('wasteB5');
    expect(routeMaterial('massMineral', true, '鋼筋', true)).toBe('wasteB5');
  });

  it('non-structural inert mineral: 一般 → R-0503, 綠色 → B5', () => {
    expect(routeMaterial('massMineral', false, 'RC+水泥砂漿', false)).toBe('wasteR0503');
    expect(routeMaterial('massMineral', true, 'RC+水泥砂漿', false)).toBe('wasteB5');
  });

  it('board mineral → R-0503 in both scenarios', () => {
    expect(routeMaterial('massMineral', false, '石膏板', false)).toBe('wasteR0503');
    expect(routeMaterial('massMineral', true, '矽酸鈣板', false)).toBe('wasteR0503');
  });

  it('metal: iron → R-1301; aluminum green → R-1304, non-green → R-0503', () => {
    expect(routeMaterial('massMetal', false, '鋼筋', true)).toBe('wasteR1301');
    expect(routeMaterial('massMetal', true, '崁入式鋁框', false)).toBe('wasteR1304');
    expect(routeMaterial('massMetal', false, '崁入式鋁框', false)).toBe('wasteR0503');
  });

  it('glass / wood / plastic: 綠色 → own code; 一般 → R-0503', () => {
    expect(routeMaterial('massGlass', true, '', false)).toBe('wasteR0401');
    expect(routeMaterial('massGlass', false, '', false)).toBe('wasteR0503');
    expect(routeMaterial('massWood', true, '', false)).toBe('wasteR0701');
    expect(routeMaterial('massPlastic', true, '', false)).toBe('wasteR0201');
  });

  it('其他 → R-0503 unconditionally', () => {
    expect(routeMaterial('massOther', false, '', false)).toBe('wasteR0503');
    expect(routeMaterial('massOther', true, '鋼筋', true)).toBe('wasteR0503');
  });
});

describe('buildSankeyFlows', () => {
  it('skips zero-mass buckets', () => {
    const r = emptyResult({ massMineral: 2400, massMetal: 314 });
    const flows = buildSankeyFlows([
      { source: '柱', green: false, hints: '鋼筋', isStructural: true, result: r },
    ]);
    expect(flows).toHaveLength(2);
    expect(flows.find((f) => f.material === 'massMineral')?.waste).toBe('wasteB5');
    expect(flows.find((f) => f.material === 'massMetal')?.waste).toBe('wasteR1301');
  });

  it('aggregates same (source, material, waste) across elements', () => {
    const r1 = emptyResult({ massMineral: 100 });
    const r2 = emptyResult({ massMineral: 50 });
    const flows = buildSankeyFlows([
      { source: 'RC外牆', green: true, hints: '水泥砂漿', isStructural: false, result: r1 },
      { source: 'RC外牆', green: true, hints: '水泥砂漿', isStructural: false, result: r2 },
    ]);
    expect(flows).toHaveLength(1);
    expect(flows[0].value).toBe(150);
    expect(flows[0].waste).toBe('wasteB5');  // non-structural + green inert
  });

  it('keeps per-element differences on separate tuples', () => {
    const r = emptyResult({ massMetal: 100 });
    const flows = buildSankeyFlows([
      { source: '鋁框', green: false, hints: '鋁框', isStructural: false, result: r },
      { source: '鋁框', green: true,  hints: '鋁框', isStructural: false, result: r },
    ]);
    // Same source+material but routes to different wastes → 2 tuples.
    expect(flows).toHaveLength(2);
    const wastes = flows.map((f) => f.waste).sort();
    expect(wastes).toEqual(['wasteR0503', 'wasteR1304'].sort());
  });
});
