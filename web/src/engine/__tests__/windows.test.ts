import { describe, expect, it } from 'vitest';
import windowsJson from '../../templates/RC/windows.json';
import { computeWindowElement, type WindowsTemplate } from '../windows';

const tpl = windowsJson as unknown as WindowsTemplate;
const closeTo = (a: number, b: number, d = 6) => expect(a).toBeCloseTo(b, d);

describe('computeWindowElement', () => {
  it('baseline frame → zero reduction for same glass', () => {
    // Pick a glass where default aluminum frame combo exists
    const glass = tpl.glasses[0];
    const r = computeWindowElement(
      { id: 'a', areaM2: 1, glass, frame: tpl.baselineFrame, reused: false, prefabModular: false, greenDemolition: false },
      tpl,
    );
    closeTo(r.reduction, 0);
    closeTo(r.reductionRatio, 0);
  });

  it('switching to a different frame changes design EC', () => {
    const glass = tpl.glasses[0];
    const otherFrame = tpl.frames.find((f) => f !== tpl.baselineFrame)!;
    const r = computeWindowElement(
      { id: 'a', areaM2: 1, glass, frame: otherFrame, reused: false, prefabModular: false, greenDemolition: false },
      tpl,
    );
    expect(r.designEC).toBeGreaterThan(0);
    // baseline EC is still computed with baseline frame
    expect(r.baselineEC).toBeGreaterThan(0);
  });

  it('throws on unknown glass/frame combo', () => {
    expect(() =>
      computeWindowElement(
        { id: 'a', areaM2: 1, glass: 'NOT-REAL', frame: 'NOT-REAL', reused: false, prefabModular: false, greenDemolition: false },
        tpl,
      ),
    ).toThrow();
  });
});
