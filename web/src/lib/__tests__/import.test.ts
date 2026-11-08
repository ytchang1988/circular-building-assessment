import { describe, expect, it } from 'vitest';
import { parseTabular } from '../import';
import rcColumnsTemplate from '../../templates/RC/columns.json';
import type { RCColumnsTemplate } from '../../engine/columns';

const template = rcColumnsTemplate as unknown as RCColumnsTemplate;

describe('parseTabular', () => {
  it('parses a TSV paste with Chinese headers', () => {
    const text = [
      '樓層\t族群與類型\t體積\t混凝土強度\t摻料\t再利用\t預鑄',
      '1F\tC-A\t1.2\t結構用混凝土，預拌，350kgf/cm2\t20%\t否\t是',
      '2F\tC-B\t0.9\t350\t30%\t是\t否',
    ].join('\n');
    const res = parseTabular(text, template);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].element.volumeM3).toBe(1.2);
    expect(res.rows[0].element.admixturePct).toBeCloseTo(0.2);
    expect(res.rows[0].element.reused).toBe(false);
    expect(res.rows[0].element.prefabModular).toBe(true);
    // "350" fuzzy-matched to full strength name
    expect(res.rows[1].element.concreteStrength).toContain('350kgf');
    expect(res.rows[1].element.reused).toBe(true);
    expect(res.rows[1].element.admixturePct).toBeCloseTo(0.3);
  });

  it('parses a CSV with English headers and strips "m³" from volume', () => {
    const text = [
      'floor,family,volume,strength,admixture,reused,modular',
      '1F,"C-A",1.5 m³,350,0.2,no,yes',
    ].join('\n');
    const res = parseTabular(text, template);
    expect(res.errors).toEqual([]);
    expect(res.rows[0].element.volumeM3).toBe(1.5);
    expect(res.rows[0].element.admixturePct).toBeCloseTo(0.2);
    expect(res.rows[0].element.prefabModular).toBe(true);
  });

  it('snaps an off-list admixture (15%) to nearest valid and warns', () => {
    const text = ['體積\t摻料', '1\t15%'].join('\n');
    const res = parseTabular(text, template);
    expect(res.rows).toHaveLength(1);
    // Snaps to either 10% or 20% — accept either, but must warn
    expect([0.1, 0.2]).toContain(res.rows[0].element.admixturePct);
    expect(res.rows[0].warnings.length).toBeGreaterThan(0);
  });

  it('errors when volume column is missing', () => {
    const text = ['樓層\t族群', '1F\tC-A'].join('\n');
    const res = parseTabular(text, template);
    expect(res.rows).toEqual([]);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('errors on a row with zero/invalid volume', () => {
    const text = ['體積', '0', 'abc'].join('\n');
    const res = parseTabular(text, template);
    expect(res.rows).toEqual([]);
    expect(res.errors).toHaveLength(2);
  });
});
