import { describe, expect, it } from 'vitest';
import { getStrategyRiskPreset } from '../core/config/strategy-risk-presets';

describe('strategy risk presets', () => {
  it('loads a defensive day trading profile', () => {
    const preset = getStrategyRiskPreset('day');
    expect(preset.riskPercent).toBe(0.5);
    expect(preset.maxPositionPercent).toBe(15);
    expect(preset.trailingAtr).toBe(1.5);
    expect(preset.tp1Percent + preset.tp2Percent).toBeLessThanOrEqual(100);
  });

  it('loads the balanced swing profile', () => {
    const preset = getStrategyRiskPreset('swing');
    expect(preset.riskPercent).toBe(1);
    expect(preset.maxPositionPercent).toBe(25);
    expect(preset.trailingAtr).toBe(2.5);
    expect(preset.entryMode).toBe('A');
  });

  it('loads the wider position profile', () => {
    const preset = getStrategyRiskPreset('position');
    expect(preset.riskPercent).toBe(1.25);
    expect(preset.maxPositionPercent).toBe(35);
    expect(preset.trailingAtr).toBe(3.5);
    expect(preset.entryMode).toBe('B');
  });
});
