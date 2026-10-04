export interface CedearConversion {
  symbol: string;
  underlyingSymbol: string;
  cedearsPerUnderlyingShare: number;
  cclArsPerUsd: number;
  localPriceArs?: number;
  updatedAt: string;
  source: string;
}

export interface CedearExecutionPlan {
  symbol: string;
  underlyingSymbol: string;
  allocationUsd: number;
  estimatedBudgetArs: number;
  localPriceArs: number;
  quantity: number;
  estimatedCostArs: number;
  residualArs: number;
  cedearsPerUnderlyingShare: number;
  cclArsPerUsd: number;
}
