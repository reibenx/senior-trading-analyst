# Server-side bridge contracts

The web client must never receive broker credentials. External broker/conversion integrations are exposed to the app only through server-side bridges.

## IOL portfolio bridge

`GET /portfolio`

Optional header: `Authorization: Bearer <IOL_BRIDGE_TOKEN>`

Expected response:

```json
{
  "positions": [
    {
      "symbol": "NVDA",
      "quantity": 167,
      "unitPrice": 15850,
      "marketValue": 2646950,
      "currency": "ARS",
      "market": "BCBA",
      "assetType": "CEDEAR"
    }
  ]
}
```

The app normalizes this payload into the generic `BrokerAdapter` contract.

## IOL asset metadata bridge

`GET /assets/info?market=BCBA&symbols=NVDA,GOOGL`

This endpoint exists to discover related trading species explicitly. The app must never infer a cable ticker by blindly appending `C`.

Expected response:

```json
{
  "assets": [
    {
      "symbol": "NVDA",
      "arsSymbol": "NVDA",
      "dollarSymbol": "NVDAD",
      "cableSymbol": "NVDAC",
      "assetType": "CEDEARS",
      "currency": "ARS",
      "settlementTerm": "T1",
      "updatedAt": "2026-10-05T14:30:00-03:00",
      "source": "iol"
    }
  ]
}
```

If no explicit cable species is returned, the quote layer skips instrument-implied CCL and uses the global CCL fallback instead.

## CEDEAR conversion: option A, all-in-one bridge

`GET /cedears/conversions?symbols=NVDA,GOOGL`

Optional header: `Authorization: Bearer <CEDEAR_CONVERSION_BRIDGE_TOKEN>`

Expected response:

```json
{
  "conversions": [
    {
      "symbol": "NVDA",
      "underlyingSymbol": "NVDA",
      "cedearsPerUnderlyingShare": 24,
      "cclArsPerUsd": 0,
      "benchmarkCclArsPerUsd": 0,
      "cclBenchmarkDeviationPercent": 0,
      "cclSource": "IMPLIED_CABLE",
      "cableSymbol": "NVDAC",
      "localPriceArs": 0,
      "localBidArs": 0,
      "localAskArs": 0,
      "marketStatus": "OPEN",
      "quoteTimestamp": "2026-10-05T14:30:00-03:00",
      "updatedAt": "2026-10-05T14:30:00-03:00",
      "source": "iol+ratio-provider"
    }
  ]
}
```

The numeric zeroes above are placeholders showing shape only; production responses must contain positive real values for ratio, CCL and local price.

## CEDEAR conversion: option B, composite bridges

When `CEDEAR_CONVERSION_BRIDGE_URL` is absent, the app can combine normalized sources.

### 1. Ratio bridge

`GET /cedears/ratios?symbols=NVDA,GOOGL`

```json
{
  "ratios": [
    {
      "symbol": "NVDA",
      "underlyingSymbol": "NVDA",
      "cedearsPerUnderlyingShare": 24,
      "updatedAt": "2026-10-05T09:00:00-03:00",
      "source": "caja-de-valores"
    }
  ]
}
```

The ratio bridge should normalize an official/primary source such as Caja de Valores or the CEDEAR program issuer.

### 2. IOL quote source

The preferred mode is direct IOL API. A bridge fallback can expose:

`GET /quotes?market=BCBA&term=t1&includeCable=true&symbols=NVDA,GOOGL`

```json
{
  "quotes": [
    {
      "symbol": "NVDA",
      "localPriceArs": 15850,
      "localBidArs": 15840,
      "localAskArs": 15860,
      "impliedCclArsPerUsd": 1618.99,
      "cableSymbol": "NVDAC",
      "marketStatus": "OPEN",
      "quoteTimestamp": "2026-10-05T14:30:00-03:00",
      "source": "iol"
    }
  ]
}
```

For CEDEARs with an explicitly discovered IOL cable symbol, instrument-implied CCL is:

`ARS CEDEAR price / cable-USD CEDEAR price`

Both legs contribute to freshness. The older timestamp is used as the effective quote timestamp so a fresh ARS leg cannot hide a stale cable leg.

### 3. Global CCL benchmark / fallback

`GET /fx/ccl`

```json
{
  "cclArsPerUsd": 0,
  "updatedAt": "2026-10-05T14:30:00-03:00",
  "source": "ccl-provider"
}
```

A positive real value is required. This source has two roles:

1. Fallback when the CEDEAR has no usable cable species.
2. Benchmark when an instrument-implied CCL exists.

The conversion engine stores both values and calculates absolute percentage deviation. By default, revalidation blocks confirmation when an implied CCL differs from the benchmark by more than 2.5%.

## Required for preview

- `symbol`
- `underlyingSymbol`
- positive `cedearsPerUnderlyingShare`
- positive `cclArsPerUsd` (instrument-implied or global fallback)
- positive `localPriceArs`
- parseable `updatedAt`

## Required for READY_TO_CONFIRM

In addition to preview requirements:

- `marketStatus` must be `OPEN`
- `quoteTimestamp` (or `updatedAt` fallback) must satisfy the configured freshness window
- ratio must be unchanged since preview
- local price drift must remain below the configured maximum
- CCL drift since preview must remain below the configured maximum
- if `cclSource=IMPLIED_CABLE` and a benchmark exists, implied/benchmark deviation must remain below the configured maximum (default 2.5%)
- refreshed quantity must remain at least one CEDEAR

`CLOSED` always blocks execution. `UNKNOWN` also blocks execution; it is acceptable for preview only.

## IOL order bridge

The broker order adapter is deliberately two-stage.

`POST /orders/validate` validates one draft and returns either validation errors, a `validation_id`, or a broker-hosted confirmation/DDJJ flow.

`POST /orders/place` requires the previously issued `validation_id` plus the same normalized order fields. The UI does not expose this placement route yet.

## Safety boundary

`/api/portfolio/execution-preview` and `/api/portfolio/execution/revalidate` never place an order. `READY_TO_CONFIRM` means only that the market state, quote freshness, ratio, CCL, benchmark deviation and quantity remain inside configured tolerances.

Any future order action must require explicit user confirmation, repeat revalidation immediately before broker validation/submission, respect broker confirmation/DDJJ flows, and use the dedicated `BrokerOrderAdapter`. The monitoring agent must never bypass this boundary.
