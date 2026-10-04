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

## CEDEAR conversion/quote bridge

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

### Required for preview

- `symbol`
- `underlyingSymbol`
- positive `cedearsPerUnderlyingShare`
- positive `cclArsPerUsd`
- positive `localPriceArs`
- parseable `updatedAt`

### Required for READY_TO_CONFIRM

In addition to preview requirements:

- `marketStatus` must be `OPEN`
- `quoteTimestamp` (or `updatedAt` fallback) must satisfy the configured freshness window
- ratio must be unchanged since preview
- local price drift must remain below the configured maximum
- CCL drift must remain below the configured maximum
- refreshed quantity must remain at least one CEDEAR

`CLOSED` always blocks execution. `UNKNOWN` also blocks execution; it is acceptable for preview only.

## Safety boundary

`/api/portfolio/execution/preview` and `/api/portfolio/execution/revalidate` never place an order. A future order endpoint must require an explicit user confirmation, repeat revalidation immediately before submission, and use a dedicated broker order adapter. The monitoring agent must not bypass this boundary.
