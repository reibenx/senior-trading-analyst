import type { CedearConversion, CedearExecutionPlan } from '@/core/domain/cedear';

export function buildCedearExecutionPlan(
  allocationUsd: number,
  conversion: CedearConversion,
): CedearExecutionPlan {
  if (allocationUsd < 0) throw new Error('Allocation must be non-negative');
  if (conversion.cclArsPerUsd <= 0) throw new Error('CCL must be positive');
  if (!conversion.localPriceArs || conversion.localPriceArs <= 0) throw new Error('Local CEDEAR price is required');
  if (conversion.cedearsPerUnderlyingShare <= 0) throw new Error('CEDEAR ratio must be positive');

  const estimatedBudgetArs = allocationUsd * conversion.cclArsPerUsd;
  const quantity = Math.floor(estimatedBudgetArs / conversion.localPriceArs);
  const estimatedCostArs = quantity * conversion.localPriceArs;
  const residualArs = Math.max(0, estimatedBudgetArs - estimatedCostArs);

  return {
    symbol: conversion.symbol,
    underlyingSymbol: conversion.underlyingSymbol,
    allocationUsd,
    estimatedBudgetArs: Math.round(estimatedBudgetArs * 100) / 100,
    localPriceArs: conversion.localPriceArs,
    quantity,
    estimatedCostArs: Math.round(estimatedCostArs * 100) / 100,
    residualArs: Math.round(residualArs * 100) / 100,
    cedearsPerUnderlyingShare: conversion.cedearsPerUnderlyingShare,
    cclArsPerUsd: conversion.cclArsPerUsd,
  };
}
