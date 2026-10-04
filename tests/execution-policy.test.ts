import { describe, expect, it } from 'vitest';
import { getExecutionPolicy } from '@/core/execution/execution-policy';

describe('execution policy', () => {
  it('defaults to disabled', () => {
    const policy = getExecutionPolicy({} as NodeJS.ProcessEnv);
    expect(policy.mode).toBe('disabled');
    expect(policy.validationEnabled).toBe(false);
    expect(policy.placementEnabled).toBe(false);
  });

  it('enables sandbox validation and placement only when a bridge is configured', () => {
    const policy = getExecutionPolicy({
      IOL_EXECUTION_MODE: 'sandbox',
      IOL_ORDER_BRIDGE_URL: 'https://sandbox.example.test',
    } as NodeJS.ProcessEnv);
    expect(policy.mode).toBe('sandbox');
    expect(policy.validationEnabled).toBe(true);
    expect(policy.placementEnabled).toBe(true);
  });

  it('keeps production placement disabled without explicit acknowledgement', () => {
    const policy = getExecutionPolicy({
      IOL_EXECUTION_MODE: 'production',
      IOL_ORDER_BRIDGE_URL: 'https://orders.example.test',
    } as NodeJS.ProcessEnv);
    expect(policy.mode).toBe('production');
    expect(policy.validationEnabled).toBe(true);
    expect(policy.placementEnabled).toBe(false);
  });

  it('requires an explicit production enable flag before placement', () => {
    const policy = getExecutionPolicy({
      IOL_EXECUTION_MODE: 'production',
      IOL_ORDER_BRIDGE_URL: 'https://orders.example.test',
      IOL_PRODUCTION_TRADING_ENABLED: 'true',
    } as NodeJS.ProcessEnv);
    expect(policy.validationEnabled).toBe(true);
    expect(policy.placementEnabled).toBe(true);
  });
});
