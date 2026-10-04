export interface FundamentalSnapshot {
  symbol: string;
  name?: string;
  sector?: string;
  industry?: string;
  marketCapitalization?: number;
  trailingPE?: number;
  forwardPE?: number;
  pegRatio?: number;
  priceToSales?: number;
  priceToBook?: number;
  evToEbitda?: number;
  profitMargin?: number;
  operatingMargin?: number;
  returnOnEquity?: number;
  returnOnAssets?: number;
  revenueGrowthYoY?: number;
  earningsGrowthYoY?: number;
  analystTargetPrice?: number;
  beta?: number;
  week52High?: number;
  week52Low?: number;
  currency?: string;
  asOf: string;
}

export interface FundamentalScore {
  quality: number;
  growth: number;
  valuation: number;
  total: number;
}
