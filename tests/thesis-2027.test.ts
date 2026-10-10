import { describe, expect, it } from 'vitest';
import { getThesis2027Overlay, listThesis2027Profiles } from '../core/engines/thesis-2027';

describe('thesis 2027 overlay', () => {
  it('prioritizes TSM and GOOGL', () => {
    expect(getThesis2027Overlay('TSM')).toMatchObject({
      stance: 'PRIORITY_ACCUMULATE',
      strategicAdjustment: 8,
      blocksNewCapital: false,
    });
    expect(getThesis2027Overlay('GOOGL')).toMatchObject({
      stance: 'PRIORITY_ACCUMULATE',
      strategicAdjustment: 8,
      blocksNewCapital: false,
    });
  });

  it('keeps VST and CEG out of incremental capital allocation', () => {
    expect(getThesis2027Overlay('VST').blocksNewCapital).toBe(true);
    expect(getThesis2027Overlay('CEG').blocksNewCapital).toBe(true);
  });

  it('blocks adding to SNDK ETHA and PLTR', () => {
    for (const symbol of ['SNDK', 'ETHA', 'PLTR']) {
      const overlay = getThesis2027Overlay(symbol);
      expect(overlay.stance).toBe('DO_NOT_ADD');
      expect(overlay.strategicAdjustment).toBe(-8);
      expect(overlay.blocksNewCapital).toBe(true);
    }
  });

  it('leaves unknown symbols neutral rather than inventing a thesis', () => {
    expect(getThesis2027Overlay('XYZ')).toMatchObject({
      stance: 'NEUTRAL',
      strategicAdjustment: 0,
      blocksNewCapital: false,
    });
  });

  it('exposes a deterministic profile set for the dashboard', () => {
    const symbols = listThesis2027Profiles().map((item) => item.symbol);
    expect(symbols).toContain('TSM');
    expect(symbols).toContain('GOOGL');
    expect(symbols).toContain('NVDA');
    expect(symbols).toContain('VST');
  });
});
