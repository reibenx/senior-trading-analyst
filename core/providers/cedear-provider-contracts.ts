import type { CedearConversion, MarketStatus } from '@/core/domain/cedear';

export interface CedearConversionProvider {
  readonly id: string;
  getConversions(symbols: string[]): Promise<CedearConversion[]>;
}

export interface CedearRatioRecord {
  symbol: string;
  underlyingSymbol: string;
  cedearsPerUnderlyingShare: number;
  updatedAt: string;
  source: string;
}

export interface LocalQuoteRecord {
  symbol: string;
  localPriceArs: number;
  localBidArs?: number;
  localAskArs?: number;
  impliedCclArsPerUsd?: number;
  marketStatus: MarketStatus;
  quoteTimestamp: string;
  source: string;
}

export interface CclSnapshot {
  cclArsPerUsd: number;
  updatedAt: string;
  source: string;
}

export interface CedearRatioProvider {
  readonly id: string;
  getRatios(symbols: string[]): Promise<CedearRatioRecord[]>;
}

export interface LocalQuoteProvider {
  readonly id: string;
  getQuotes(symbols: string[]): Promise<LocalQuoteRecord[]>;
}

export interface CclProvider {
  readonly id: string;
  getCcl(): Promise<CclSnapshot>;
}
