import { describe, expect, it } from 'vitest';
import { buildThesis2027HistoryState } from '../core/persistence/thesis-2027-history-store';

describe('thesis 2027 history', () => {
  it('classifies a strengthening thesis', () => {
    const state = buildThesis2027HistoryState('TSM', {
      observedAt: '2026-10-10T02:00:00Z',
      adjustment: 9,
      evidenceStatus: 'CONFIRMED',
    }, {
      symbol: 'TSM',
      observations: [{
        observedAt: '2026-10-09T02:00:00Z',
        adjustment: 6,
        evidenceStatus: 'MIXED',
      }],
    });

    expect(state.trend).toBe('STRENGTHENING');
    expect(state.adjustmentDelta).toBe(3);
    expect(state.regimeChanged).toBe(true);
    expect(state.previousEvidenceStatus).toBe('MIXED');
    expect(state.currentEvidenceStatus).toBe('CONFIRMED');
  });

  it('classifies a weakening thesis', () => {
    const state = buildThesis2027HistoryState('NVDA', {
      observedAt: '2026-10-10T02:00:00Z',
      adjustment: 2,
      evidenceStatus: 'WEAK',
    }, {
      symbol: 'NVDA',
      observations: [{
        observedAt: '2026-10-09T02:00:00Z',
        adjustment: 6,
        evidenceStatus: 'CONFIRMED',
      }],
    });

    expect(state.trend).toBe('WEAKENING');
    expect(state.adjustmentDelta).toBe(-4);
    expect(state.regimeChanged).toBe(true);
  });

  it('keeps small changes stable', () => {
    const state = buildThesis2027HistoryState('GOOGL', {
      observedAt: '2026-10-10T02:00:00Z',
      adjustment: 9,
      evidenceStatus: 'CONFIRMED',
    }, {
      symbol: 'GOOGL',
      observations: [{
        observedAt: '2026-10-09T02:00:00Z',
        adjustment: 8,
        evidenceStatus: 'CONFIRMED',
      }],
    });

    expect(state.trend).toBe('STABLE');
    expect(state.adjustmentDelta).toBe(1);
    expect(state.regimeChanged).toBe(false);
  });

  it('uses the current observation as the first history point when no history exists', () => {
    const current = {
      observedAt: '2026-10-10T02:00:00Z',
      adjustment: 8,
      evidenceStatus: 'CONFIRMED' as const,
    };
    const state = buildThesis2027HistoryState('TSM', current, null);

    expect(state.observations).toBe(1);
    expect(state.trend).toBe('STABLE');
    expect(state.adjustmentDelta).toBeUndefined();
    expect(state.firstObservedAt).toBe(current.observedAt);
  });
});
