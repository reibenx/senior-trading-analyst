export type MarketStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export interface CedearConversion {
  symbol: string;
  underlyingSymbol: string;
  cedearsPerUnderlyingShare: number;
  cclArsPerUsd: number;
  localPriceArs?: number;
  localBidArs?: number;
  localAskArs?: number;
  marketStatus?: MarketStatus;
  quoteTimestamp?: string;
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

export interface CedearExecutionIntent {
  symbol: string;
  allocationUsd: number;
  previewLocalPriceArs: number;
  previewQuantity: number;
  previewCclArsPerUsd: number;
  previewRatio: number;
  previewedAt: string;
}

export type CedearRevalidationStatus =
  | 'READY_TO_CONFIRM'
  | 'MARKET_CLOSED'
  | 'MARKET_UNKNOWN'
  | 'STALE_QUOTE'
  | 'PRICE_MOVED'
  | 'RATIO_CHANGED'
  | 'CCL_MOVED'
  | 'INSUFFICIENT_BUDGET'
  | 'MISSING_CONVERSION';

export interface CedearRevalidationResult {
  symbol: string;
  status: CedearRevalidationStatus;
  readyToConfirm: boolean;
  reason?: string;
  latestConversion?: CedearConversion;
  refreshedPlan?: CedearExecutionPlan;
  priceDriftPercent?: number;
  cclDriftPercent?: number;
}
