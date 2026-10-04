export type ExecutionMode = 'disabled' | 'sandbox' | 'production';

export interface ExecutionPolicy {
  mode: ExecutionMode;
  validationEnabled: boolean;
  simulationEnabled: boolean;
  placementEnabled: boolean;
  reason?: string;
}

type EnvLike = Record<string, string | undefined>;

function normalizedMode(value: string | undefined): ExecutionMode {
  if (value === 'sandbox' || value === 'production') return value;
  return 'disabled';
}

export function getExecutionPolicy(env: EnvLike = process.env): ExecutionPolicy {
  const mode = normalizedMode(env.IOL_EXECUTION_MODE?.trim().toLowerCase());

  if (mode === 'disabled') {
    return {
      mode,
      validationEnabled: false,
      simulationEnabled: false,
      placementEnabled: false,
      reason: 'La ejecución está deshabilitada por configuración.',
    };
  }

  if (mode === 'sandbox') {
    const sandboxUrl = env.IOL_ORDER_BRIDGE_URL?.trim() || env.IOL_BRIDGE_URL?.trim();
    if (!sandboxUrl) {
      return {
        mode,
        validationEnabled: false,
        simulationEnabled: false,
        placementEnabled: false,
        reason: 'Sandbox seleccionado pero no hay bridge de validación configurado.',
      };
    }
    return {
      mode,
      validationEnabled: true,
      simulationEnabled: true,
      placementEnabled: false,
      reason: 'Sandbox seguro: valida contra el bridge, pero la colocación es siempre simulada.',
    };
  }

  return {
    mode,
    validationEnabled: true,
    simulationEnabled: false,
    placementEnabled: false,
    reason: 'La colocación real desde la web-app permanece deshabilitada por diseño. Producción sólo admite validación y revisión.',
  };
}

export function assertValidationAllowed(policy: ExecutionPolicy) {
  if (!policy.validationEnabled) {
    throw new Error(policy.reason ?? 'Order validation is disabled');
  }
}

export function assertSimulationAllowed(policy: ExecutionPolicy) {
  if (!policy.simulationEnabled || policy.mode !== 'sandbox') {
    throw new Error(policy.reason ?? 'Sandbox simulation is disabled');
  }
}

export function assertPlacementAllowed(policy: ExecutionPolicy) {
  if (!policy.placementEnabled) {
    throw new Error(policy.reason ?? 'Order placement is disabled');
  }
}
