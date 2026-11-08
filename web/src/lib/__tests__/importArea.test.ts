import { describe, expect, it } from 'vitest';
import { parseAreaTabular } from '../importArea';
import { parseWindowTabular } from '../importWindow';
import claddingJson from '../../templates/RC/cladding.json';
import windowsJson from '../../templates/RC/windows.json';
import type { CompositeTemplate } from '../../engine/composite';
import type { WindowsTemplate } from '../../engine/windows';

const cladding = claddingJson as unknown as CompositeTemplate;
const windows = windowsJson as unknown as WindowsTemplate;

const areaConfig = {
  constructionNames: cladding.constructions.map((c) => c.name),
  defaults: cladding.elementDefaults,
};

const winConfig = {
  glasses: windows.glasses,
  frames: windows.frames,
  defaults: windows.elementDefaults,
};

describe('parseAreaTabular', () => {
  it('parses area-based rows with Chinese headers', () => {
    const baseline = cladding.baselineConstruction;
    const text = [
      '樓層\t族群\t面積\t構造類型\t再利用\t綠建材\t預鑄',
      `1F\tW-A\t8.5\t${baseline}\t否\t否\t是`,
      `2F\tW-B\t12 m²\t${baseline}\t是\t是\t否`,
    ].join('\n');
    const res = parseAreaTabular(text, areaConfig);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].element.areaM2).toBe(8.5);
    expect(res.rows[0].element.prefabModular).toBe(true);
    expect(res.rows[1].element.areaM2).toBe(12);
    expect(res.rows[1].element.greenRecycled).toBe(true);
    expect(res.rows[1].element.reused).toBe(true);
  });

  it('fuzzy-matches partial construction name to full name', () => {
    // Pick a construction whose name contains a distinctive substring
    const target = cladding.constructions[0].name;
    const partial = target.slice(0, Math.min(5, target.length));
    const text = [`面積\t構造`, `10\t${partial}`].join('\n');
    const res = parseAreaTabular(text, areaConfig);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].element.constructionType).toBe(target);
  });

  it('errors when area column is missing', () => {
    const text = ['樓層\t族群', '1F\tW-A'].join('\n');
    const res = parseAreaTabular(text, areaConfig);
    expect(res.rows).toEqual([]);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('positional fallback: when headers are garbled, detect numeric column as area', () => {
    // Simulate a corrupted-UTF-8 Google Sheets export: headers unreadable,
    // but column 3 is reliably numeric across 5 rows.
    const text = [
      '樓層,?garbage?,?garbage?,?garbage?',
      ',CT-1 二?色平?,3.19,',
      ',CT-1 二?色平?,15.23,',
      ',CT-1 二?色平?,2.75,',
      ',CT-1 二?色平?,9.81,',
      ',CT-1 二?色平?,4.2,',
    ].join('\n');
    const res = parseAreaTabular(text, areaConfig);
    expect(res.rows).toHaveLength(5);
    expect(res.rows[0].element.areaM2).toBe(3.19);
    expect(res.rows[4].element.areaM2).toBe(4.2);
    // Fallback should emit a warning on the first row
    expect(res.rows[0].warnings.some((w) => w.includes('位置推測'))).toBe(true);
    // ConstructionType falls back to default (not matched)
    expect(res.rows[0].element.constructionType).toBe(areaConfig.defaults.constructionType);
  });
});

describe('parseWindowTabular', () => {
  it('parses window rows and fuzzy-matches glass/frame', () => {
    const glass = windows.glasses[0];
    const frame = windows.baselineFrame;
    const text = [
      '樓層\t族群\t面積\t玻璃\t窗框\t再利用\t預鑄',
      `1F\tWIN-A\t2.4\t${glass}\t${frame}\t否\t否`,
    ].join('\n');
    const res = parseWindowTabular(text, winConfig);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].element.areaM2).toBe(2.4);
    expect(res.rows[0].element.glass).toBe(glass);
    expect(res.rows[0].element.frame).toBe(frame);
  });

  it('errors when area column is missing', () => {
    const text = ['樓層\t玻璃', '1F\tfoo'].join('\n');
    const res = parseWindowTabular(text, winConfig);
    expect(res.rows).toEqual([]);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
