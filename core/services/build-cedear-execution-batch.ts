import type { CedearConversion, CedearExecutionBatch, CedearExecutionItem } from '@/core/domain/cedear';
import type { MonthlyAllocationPlan } from '@/core/domain/opportunity';
import { buildCedearExecutionPlan } from '@/core/engines/cedear-execution';

function isFresh(updatedAt: string, maxAgeMinutes: number): boolean {
  const time = Date.parse(updatedAt);
  if (!Number.isFinite(time)) return false;
  return Date.now() - time <= maxAgeMinutes * 60_000;
}

export function buildCedearExecutionBatch(
  allocation: MonthlyAllocationPlan,
  conversions: CedearConversion[],
  maxConversionAgeMinutes = 30,
): CedearExecutionBatch {
  const conversionMap = new Map(conversions.map((item) => [item.symbol.toUpperCase(), item]));
  const items: CedearExecutionItem[] = allocation.items.map((allocationItem) => {
    const conversion = conversionMap.get(allocationItem.symbol.toUpperCase());
    if (!conversion) {
      return {
        symbol: allocationItem.symbol,
        allocationUsd: allocationItem.allocationAmount,
        executable: false,
        status: 'MISSING_CONVERSION',
        reason: 'No hay ratio/CCL/precio local vigente para este CEDEAR.',
      };
    }

    if (!isFresh(conversion.updatedAt, maxConversionAgeMinutes)) {
      return {
        symbol: allocationItem.symbol,
        allocationUsd: allocationItem.allocationAmount,
        executable: false,
        status: 'STALE_CONVERSION',
        conversion,
        reason: `La conversión excede la antigüedad máxima de ${maxConversionAgeMinutes} minutos.`,
      };
    }

    try {
      const plan = buildCedearExecutionPlan(allocationItem.allocationAmount, conversion);
      if (plan.quantity < 1) {
        return {
          symbol: allocationItem.symbol,
          allocationUsd: allocationItem.allocationAmount,
          executable: false,
          status: 'INSUFFICIENT_BUDGET',
          conversion,
          plan,
          reason: 'El presupuesto asignado no alcanza para una unidad al precio local informado.',
        };
      }

      return {
        symbol: allocationItem.symbol,
        allocationUsd: allocationItem.allocationAmount,
        executable: true,
        status: 'READY',
        conversion,
        plan,
      };
    } catch (error) {
      return {
        symbol: allocationItem.symbol,
        allocationUsd: allocationItem.allocationAmount,
        executable: false,
        status: 'ERROR',
        conversion,
        reason: error instanceof Error ? error.message : 'No fue posible construir el plan de ejecución.',
      };
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    maxConversionAgeMinutes,
    items,
    executableCount: items.filter((item) => item.executable).length,
    blockedCount: items.filter((item) => !item.executable).length,
    totalAllocationUsd: allocation.items.reduce((sum, item) => sum + item.allocationAmount, 0),
    estimatedTotalCostArs: items.reduce((sum, item) => sum + (item.plan?.estimatedCostArs ?? 0), 0),
  };
}
