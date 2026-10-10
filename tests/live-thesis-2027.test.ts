import { describe, expect, it } from 'vitest';
import { assessLiveThesis2027 } from '../core/engines/live-thesis-2027';
import { getThesis2027Overlay } from '../core/engines/thesis-2027';

describe('live thesis 2027', () => {
  it('does not change the thesis when evidence coverage is insufficient', () => {
    const overlay = getThesis2027Overlay('TSM');
    const result = assessLiveThesis2027(overlay, {
      fundamentalScore: 50,
      valuationScore: 50,
      marketScore: 78,
      convictionScore: 50,
    });

    expect(result.status).toBe('INSUFFICIENT');
    expect(result.dynamicAdjustment).toBe(0);
    expect(result.finalAdjustment).toBe(overlay.strategicAdjustment);
  });

  it('strengthens a thesis when fundamentals and valuation confirm it', () => {
    const overlay = getThesis2027Overlay('TSM');
    const result = assessLiveThesis2027(overlay, {
      fundamentalScore: 82,
      valuationScore: 72,
      marketScore: 74,
      convictionScore: 81,
    });

    expect(result.status).toBe('CONFIRMED');
    expect(result.dynamicAdjustment).toBe(4);
    expect(result.finalAdjustment).toBe(10);
  });

  it('weakens a thesis when fundamentals and valuation deteriorate', () => {
    const overlay = getThesis2027Overlay('NVDA');
    const result = assessLiveThesis2027(overlay, {
      fundamentalScore: 38,
      valuationScore: 30,
      marketScore: 32,
      convictionScore: 39,
    });

    expect(result.status).toBe('WEAK');
    expect(result.dynamicAdjustment).toBe(-4);
    expect(result.finalAdjustment).toBe(0);
  });

  it('keeps the final overlay bounded', () => {
    const overlay = getThesis2027Overlay('SNDK');
    const result = assessLiveThesis2027(overlay, {
      fundamentalScore: 30,
      valuationScore: 28,
      marketScore: 30,
      convictionScore: 35,
    });

    expect(result.finalAdjustment).toBe(-10);
  });
});
