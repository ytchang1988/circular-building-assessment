import { describe, expect, it } from 'vitest';
import {
  classifyMaterial, singleBucket, emptyBreakdown,
} from '../materialClassify';

describe('classifyMaterial', () => {
  it.each([
    ['預鑄乾式RC外牆(免砂漿粉刷)塗料外裝', 'massMineral'],
    ['水泥砂漿粉刷', 'massMineral'],
    ['磁磚', 'massMineral'],
    ['ALC輕質板', 'massMineral'],
    ['崁入式鋁框', 'massMetal'],
    ['不鏽鋼飾面', 'massMetal'],
    ['5+5mm強化膠合玻璃', 'massGlass'],
    ['6mmLow-E玻璃', 'massGlass'],
    ['實木地板', 'massWood'],
    ['竹地板', 'massWood'],
    ['PVC塑膠地板', 'massPlastic'],
    ['FRP防水層', 'massPlastic'],
    ['不明構造', 'massOther'],
    ['', 'massOther'],
  ])('%s → %s', (name, expected) => {
    expect(classifyMaterial(name)).toBe(expected);
  });
});

describe('singleBucket', () => {
  it('puts the full mass into the matching bucket, zeros elsewhere', () => {
    const b = singleBucket('水泥砂漿粉刷RC外牆', 500);
    expect(b.massMineral).toBe(500);
    expect(b.massMetal).toBe(0);
    expect(b.massGlass).toBe(0);
    expect(b.massWood).toBe(0);
    expect(b.massPlastic).toBe(0);
    expect(b.massOther).toBe(0);
  });

  it('falls back to massOther for unrecognized names', () => {
    const b = singleBucket('unknown material', 100);
    expect(b.massOther).toBe(100);
  });
});

describe('emptyBreakdown', () => {
  it('returns all-zero buckets', () => {
    const b = emptyBreakdown();
    expect(Object.values(b).every((v) => v === 0)).toBe(true);
  });
});
