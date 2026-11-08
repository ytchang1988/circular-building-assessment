import { describe, expect, it } from 'vitest';
import { computeWaste } from '../waste';
import { emptyBreakdown } from '../materialClassify';

describe('computeWaste (per 材料 reference sheet)', () => {
  it('結構 RC 一般拆除: concrete → B5, rebar → R-1301, rest → R-0503', () => {
    const m = emptyBreakdown();
    m.massMineral = 2400;  // concrete
    m.massMetal = 314;     // rebar
    m.massGlass = 10;
    m.massWood = 5;
    m.massPlastic = 3;
    m.massOther = 2;
    const w = computeWaste(m, false, '鋼筋', true);
    expect(w.wasteB5).toBe(2400);        // structural concrete → B5
    expect(w.wasteR1301).toBe(314);      // rebar always R-1301
    expect(w.wasteR0503).toBe(10 + 5 + 3 + 2); // glass/wood/plastic/other → mixed
    expect(w.wasteR1304).toBe(0);
    expect(w.wasteR0401).toBe(0);
    expect(w.wasteR0701).toBe(0);
    expect(w.wasteR0201).toBe(0);
  });

  it('結構 RC 綠色拆除: concrete → B5, rebar → R-1301', () => {
    const m = emptyBreakdown();
    m.massMineral = 2400;
    m.massMetal = 314;
    const w = computeWaste(m, true, '鋼筋', true);
    expect(w.wasteB5).toBe(2400);
    expect(w.wasteR1301).toBe(314);
    expect(w.wasteR0503).toBe(0);
  });

  it('非結構 外裝 一般拆除: cement mortar / tile → R-0503, not B5', () => {
    const m = emptyBreakdown();
    m.massMineral = 180;  // cement mortar + tile
    const w = computeWaste(m, false, 'RC+水泥砂漿粉刷+磁磚');
    expect(w.wasteB5).toBe(0);
    expect(w.wasteR0503).toBe(180);
  });

  it('非結構 外裝 綠色拆除: cement mortar / tile → B5 (sorted inert)', () => {
    const m = emptyBreakdown();
    m.massMineral = 180;
    const w = computeWaste(m, true, 'RC+水泥砂漿粉刷+磁磚');
    expect(w.wasteB5).toBe(180);
    expect(w.wasteR0503).toBe(0);
  });

  it('非結構 內牆 石膏板: mineral → R-0503 in both scenarios (not inert)', () => {
    const m = emptyBreakdown();
    m.massMineral = 60;
    const w1 = computeWaste(m, false, '矽酸鈣板牆');
    const w2 = computeWaste(m, true, '石膏板輕隔間');
    expect(w1.wasteB5).toBe(0);
    expect(w1.wasteR0503).toBe(60);
    expect(w2.wasteB5).toBe(0);
    expect(w2.wasteR0503).toBe(60);
  });

  it('外窗 一般拆除: aluminum → R-0503 (mixed, not separated)', () => {
    const m = emptyBreakdown();
    m.massMetal = 100;
    m.massGlass = 50;
    const w = computeWaste(m, false, '崁入式鋁框');
    expect(w.wasteR1304).toBe(0);
    expect(w.wasteR0503).toBe(150);
    expect(w.wasteR0401).toBe(0);
  });

  it('外窗 綠色拆除: aluminum → R-1304, glass → R-0401', () => {
    const m = emptyBreakdown();
    m.massMetal = 100;
    m.massGlass = 50;
    const w = computeWaste(m, true, '崁入式鋁框');
    expect(w.wasteR1304).toBe(100);
    expect(w.wasteR0401).toBe(50);
    expect(w.wasteR0503).toBe(0);
  });

  it('綠色拆除 (非結構): wood → R-0701, plastic → R-0201', () => {
    const m = emptyBreakdown();
    m.massWood = 10;
    m.massPlastic = 2;
    const w = computeWaste(m, true);
    expect(w.wasteR0701).toBe(10);
    expect(w.wasteR0201).toBe(2);
  });

  it('invariant: sum of waste codes equals total mass (structural)', () => {
    const m = emptyBreakdown();
    m.massMineral = 100; m.massMetal = 50; m.massGlass = 25;
    m.massWood = 10; m.massPlastic = 5; m.massOther = 3;
    const total = 100 + 50 + 25 + 10 + 5 + 3;
    for (const green of [false, true]) {
      const w = computeWaste(m, green, '鋼筋', true);
      const sum =
        w.wasteB5 +
        w.wasteR1301 + w.wasteR1304 +
        w.wasteR0401 + w.wasteR0701 +
        w.wasteR0201 + w.wasteR0503;
      expect(sum).toBe(total);
    }
  });

  it('invariant: sum of waste codes equals total mass (non-structural)', () => {
    const m = emptyBreakdown();
    m.massMineral = 100; m.massMetal = 50; m.massGlass = 25;
    m.massWood = 10; m.massPlastic = 5; m.massOther = 3;
    const total = 100 + 50 + 25 + 10 + 5 + 3;
    for (const green of [false, true]) {
      const w = computeWaste(m, green, '崁入式鋁框');
      const sum =
        w.wasteB5 +
        w.wasteR1301 + w.wasteR1304 +
        w.wasteR0401 + w.wasteR0701 +
        w.wasteR0201 + w.wasteR0503;
      expect(sum).toBe(total);
    }
  });
});
