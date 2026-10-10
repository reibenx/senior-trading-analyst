import { describe, expect, it } from 'vitest';
import { assessThesis2027StructuredSignals } from '../core/engines/thesis-2027-structured';

describe('thesis 2027 structured signals', () => {
  it('detects raised guidance', () => {
    const result = assessThesis2027StructuredSignals([
      {
        title: 'Company raises guidance after strong AI demand',
        url: 'https://example.com/guidance',
      },
    ], null, 100);

    expect(result.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'GUIDANCE', direction: 1 }),
    ]));
    expect(result.adjustment).toBe(1);
  });

  it('detects analyst downgrade', () => {
    const result = assessThesis2027StructuredSignals([
      {
        title: 'Broker downgrades shares to underweight',
        url: 'https://example.com/downgrade',
      },
    ], null, 100);

    expect(result.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'ANALYST_REVISION', direction: -1 }),
    ]));
    expect(result.adjustment).toBe(-1);
  });

  it('uses consensus price target upside when fundamentals expose it', () => {
    const result = assessThesis2027StructuredSignals([], {
      symbol: 'AAA',
      analystTargetPrice: 130,
      asOf: '2026-10-09T12:00:00Z',
    }, 100);

    expect(result.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'PRICE_TARGET', direction: 1 }),
    ]));
  });

  it('detects expanding AI capex', () => {
    const result = assessThesis2027StructuredSignals([
      {
        title: 'Hyperscaler boosts capex for AI infrastructure and data centers',
        url: 'https://example.com/capex',
      },
    ], null, 100);

    expect(result.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'CAPEX_AI', direction: 1 }),
    ]));
  });

  it('caps combined structured influence to three points', () => {
    const result = assessThesis2027StructuredSignals([
      {
        title: 'Company raises guidance, receives upgrade and boosts capex for AI infrastructure',
        url: 'https://example.com/all',
      },
    ], {
      symbol: 'AAA',
      analystTargetPrice: 140,
      asOf: '2026-10-09T12:00:00Z',
    }, 100);

    expect(result.signals.length).toBe(4);
    expect(result.adjustment).toBe(3);
    expect(result.coverage).toBe(100);
  });
});
