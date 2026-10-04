import type {
  CedearConversion,
  CedearExecutionIntent,
  CedearRevalidationResult,
} from '@/core/domain/cedear';
import { buildCedearExecutionPlan } from '@/core/engines/cedear-execution';

function pctDrift(current: number, reference: number): number {
  if (reference <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs((current - reference) / reference) * 100;
}

function isFresh(timestamp: string | undefined, maxAgeSeconds: number): boolean {
  if (!timestamp) return false;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed <= maxAgeSeconds * 1000;
}

export interface RevalidateExecutionOptions {
  maxQuoteAgeSeconds?: number;
  maxPriceDriftPercent?: number;
  maxCclDriftPercent?: number;
  maxCclBenchmarkDeviationPercent?: number;
  requireOpenMarket?: boolean;
}

export function revalidateCedearExecution(
  intent: CedearExecutionIntent,
  latest: CedearConversion | undefined,
  options: RevalidateExecutionOptions = {},
): CedearRevalidationResult {
  const maxQuoteAgeSeconds = options.maxQuoteAgeSeconds ?? 120;
  const maxPriceDriftPercent = options.maxPriceDriftPercent ?? 1;
  const maxCclDriftPercent = options.maxCclDriftPercent ?? 1.5;
  const maxCclBenchmarkDeviationPercent = options.maxCclBenchmarkDeviationPercent ?? 2.5;
  const requireOpenMarket = options.requireOpenMarket ?? true;

  if (!latest || !latest.localPriceArs) {
    return {
      symbol: intent.symbol,
      status: 'MISSING_CONVERSION',
      readyToConfirm: false,
      reason: 'No hay conversión/cotización local disponible para revalidar la operación.',
    };
  }

  if (requireOpenMarket) {
    if (latest.marketStatus === 'CLOSED') {
      return {
        symbol: intent.symbol,
        status: 'MARKET_CLOSED',
        readyToConfirm: false,
        latestConversion: latest,
        reason: 'El mercado está cerrado. La previsualización puede consultarse, pero no habilita confirmación.',
      };
    }
    if (latest.marketStatus !== 'OPEN') {
      return {
        symbol: intent.symbol,
        status: 'MARKET_UNKNOWN',
        readyToConfirm: false,
        latestConversion: latest,
        reason: 'El proveedor no confirmó que la rueda esté abierta.',
      };
    }
  }

  const quoteTimestamp = latest.quoteTimestamp ?? latest.updatedAt;
  if (!isFresh(quoteTimestamp, maxQuoteAgeSeconds)) {
    return {
      symbol: intent.symbol,
      status: 'STALE_QUOTE',
      readyToConfirm: false,
      latestConversion: latest,
      reason: `La cotización supera los ${maxQuoteAgeSeconds} segundos permitidos.`,
    };
  }

  if (latest.cedearsPerUnderlyingShare !== intent.previewRatio) {
    return {
      symbol: intent.symbol,
      status: 'RATIO_CHANGED',
      readyToConfirm: false,
      latestConversion: latest,
      reason: 'El ratio CEDEAR/subyacente cambió desde la previsualización.',
    };
  }

  const priceDriftPercent = pctDrift(latest.localPriceArs, intent.previewLocalPriceArs);
  if (priceDriftPercent > maxPriceDriftPercent) {
    return {
      symbol: intent.symbol,
      status: 'PRICE_MOVED',
      readyToConfirm: false,
      latestConversion: latest,
      priceDriftPercent,
      reason: `El precio local se movió ${priceDriftPercent.toFixed(2)}%, por encima del máximo permitido de ${maxPriceDriftPercent}%.`,
    };
  }

  const cclDriftPercent = pctDrift(latest.cclArsPerUsd, intent.previewCclArsPerUsd);
  if (cclDriftPercent > maxCclDriftPercent) {
    return {
      symbol: intent.symbol,
      status: 'CCL_MOVED',
      readyToConfirm: false,
      latestConversion: latest,
      cclDriftPercent,
      reason: `El CCL se movió ${cclDriftPercent.toFixed(2)}%, por encima del máximo permitido de ${maxCclDriftPercent}%.`,
    };
  }

  const benchmarkDeviation = latest.cclBenchmarkDeviationPercent;
  if (
    latest.cclSource === 'IMPLIED_CABLE'
    && benchmarkDeviation !== undefined
    && benchmarkDeviation > maxCclBenchmarkDeviationPercent
  ) {
    return {
      symbol: intent.symbol,
      status: 'CCL_BENCHMARK_DIVERGED',
      readyToConfirm: false,
      latestConversion: latest,
      priceDriftPercent,
      cclDriftPercent,
      cclBenchmarkDeviationPercent: benchmarkDeviation,
      reason: `El CCL implícito del CEDEAR se desvía ${benchmarkDeviation.toFixed(2)}% del benchmark, por encima del máximo permitido de ${maxCclBenchmarkDeviationPercent}%.`,
    };
  }

  const refreshedPlan = buildCedearExecutionPlan(intent.allocationUsd, latest);
  if (refreshedPlan.quantity < 1) {
    return {
      symbol: intent.symbol,
      status: 'INSUFFICIENT_BUDGET',
      readyToConfirm: false,
      latestConversion: latest,
      refreshedPlan,
      priceDriftPercent,
      cclDriftPercent,
      cclBenchmarkDeviationPercent: benchmarkDeviation,
      reason: 'El presupuesto ya no alcanza para una unidad al precio revalidado.',
    };
  }

  return {
    symbol: intent.symbol,
    status: 'READY_TO_CONFIRM',
    readyToConfirm: true,
    latestConversion: latest,
    refreshedPlan,
    priceDriftPercent,
    cclDriftPercent,
    cclBenchmarkDeviationPercent: benchmarkDeviation,
  };
}
