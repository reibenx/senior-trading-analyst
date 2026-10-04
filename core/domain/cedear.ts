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

export interface CedearExecutionItem {
  symbol: string;
  allocationUsd: number;
  executable: boolean;
  status: 'READY' | 'MISSING_CONVERSION' | 'STALE_CONVERSION' | 'INSUFFICIENT_BUDGET' | 'ERROR';
  conversion?: CedearConversion;
  plan?: CedearExecutionPlan;
  reason?: string;
}

export interface CedearExecutionBatch {
  generatedAt: string;
  maxConversionAgeMinutes: number;
  items: CedearExecutionItem[];
  executableCount: number;
  blockedCount: number;
  totalAllocationUsd: number;
  estimatedTotalCostArs: number;
}
