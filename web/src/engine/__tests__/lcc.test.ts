/**
 * LCC engine spec conformance.
 *
 * Reference row from `LCC計算規格.md` §8.1 (沙崙案, 情境 A, i=5.2%):
 *   結構 | B5 | 557,726.90 kg
 *   C1 = 159,436.83 | C2運 = 66,927.23 | C2處 = 948,135.73 | D = 111,545.38
 *   名目淨 = 1,062,954.41 | PV(t=60) = 160,595.29
 */

import { describe, expect, it } from 'vitest';
import { computeLCC, LCC_PARAMS, realRate } from '../lcc';
import type { WasteBreakdown } from '../waste';

const empty = (): WasteBreakdown => ({
  wasteB5: 0, wasteR1301: 0, wasteR1304: 0,
  wasteR0401: 0, wasteR0701: 0, wasteR0201: 0, wasteR0503: 0,
});

const close = (a: number, b: number, digits = 2) =>
  expect(a).toBeCloseTo(b, digits);

describe('computeLCC — spec §8.1 沙崙案 structural B5 row (scenario A)', () => {
  it('matches the reference row within rounding', () => {
    const w = empty();
    w.wasteB5 = 557726.90;
    const r = computeLCC(w, false, '結構', 0.052);

    close(r.C1,  159436.83, 1);   // m × kA
    close(r.C2t, 66927.23,  1);   // (m/1000) × 15 × 8
    close(r.C2p, 948135.73, 1);   // m × 1.70
    close(r.D,   111545.38, 1);   // m × 0.20
    close(r.nominal, 1062954.41, 1);
    close(r.PV,  160595.29, 0);   // divide by (1.032)^60
  });
});

describe('computeLCC — scenario B applies f only to applicable categories', () => {
  it('B5 does NOT get the f surcharge even in scenario B', () => {
    const w = empty();
    w.wasteB5 = 557726.90;
    const r = computeLCC(w, true, '結構', 0.052);
    // = m × kB ≈ 171,053.72 per spec §8.2
    close(r.C1, 171053.72, 1);
  });

  it('R-1301 鋼鐵 does NOT get f (metals never trigger precision demolition)', () => {
    const w = empty();
    w.wasteR1301 = 100000;
    const r = computeLCC(w, true, '結構', 0.052);
    // = m × kB (no f), never m × (kB + f)
    close(r.C1, 100000 * LCC_PARAMS.kB, 2);
  });

  it('R-0401 廢玻璃 in scenario B gets +f (applicable category + green)', () => {
    const w = empty();
    w.wasteR0401 = 1000;
    const rA = computeLCC(w, false, '外裝', 0.052);
    const rB = computeLCC(w, true, '外裝', 0.052);
    // Difference should be exactly m × (kB − kA + f)
    close(rB.C1 - rA.C1, 1000 * (LCC_PARAMS.kB - LCC_PARAMS.kA + LCC_PARAMS.f), 2);
  });
});

describe('computeLCC — discount lifetime depends on layer', () => {
  it('internal-wall (20 yr) PV is >3× of structural (60 yr) for same nominal', () => {
    const w = empty();
    w.wasteB5 = 10000;
    const rStruct = computeLCC(w, false, '結構', 0.052);
    const rInt    = computeLCC(w, false, '內裝', 0.052);
    expect(rStruct.nominal).toBeCloseTo(rInt.nominal, 2);  // nominal is the same
    const ratio = rInt.PV / rStruct.PV;
    expect(ratio).toBeGreaterThan(3.3);
    expect(ratio).toBeLessThan(3.6);
  });
});

describe('realRate uses the approximate form (not Fisher)', () => {
  it('r = i − j − k', () => {
    close(realRate(0.052), 0.032, 6);
    close(realRate(0.042), 0.022, 6);
    close(realRate(0.062), 0.042, 6);
  });
});
