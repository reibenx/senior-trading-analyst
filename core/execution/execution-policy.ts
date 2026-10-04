export type ExecutionMode = 'disabled' | 'sandbox' | 'production';

export interface ExecutionPolicy {
  mode: ExecutionMode;
  validationEnabled: boolean;
  placementEnabled: boolean;
  reason?: string;
}

function normalizedMode(value: string | undefined): ExecutionMode {
  if (value === 'sandbox' || value === 'production') return value;
  return 'disabled';
}

export function getExecutionPolicy(env: NodeJS.ProcessEnv = process.env): ExecutionPolicy {
  const mode = normalizedMode(env.IOL_EXECUTION_MODE?.trim().toLowerCase());

  if (mode === 'disabled') {
    return {
      mode,
      validationEnabled: false,
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
        placementEnabled: false,
        reason: 'Sandbox seleccionado pero no hay bridge de órdenes configurado.',
      };
    }
    return {
      mode,
      validationEnabled: true,
      placementEnabled: true,
    };
  }

  const productionAck = env.IOL_PRODUCTION_TRADING_ENABLED?.trim().toLowerCase() === 'true';
  if (!productionAck) {
    return {
      mode,
      validationEnabled: true,
      placementEnabled: false,
      reason: 'Producción seleccionada, pero IOL_PRODUCTION_TRADING_ENABLED no está habilitado explícitamente.',
    };
  }

  return {
    mode,
    validationEnabled: true,
    placementEnabled: true,
  };
}

export function assertValidationAllowed(policy: ExecutionPolicy) {
  if (!policy.validationEnabled) {
    throw new Error(policy.reason ?? 'Order validation is disabled');
  }
}

export function assertPlacementAllowed(policy: ExecutionPolicy) {
  if (!policy.placementEnabled) {
    throw new Error(policy.reason ?? 'Order placement is disabled');
  }
}
