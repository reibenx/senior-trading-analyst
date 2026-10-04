# Deployment checklist

The application can run on any platform that supports a Node.js 22 container or a standard Next.js deployment.

## 1. Build

The repository uses Next.js standalone output. The production image can be built with:

```bash
docker build -t senior-trading-analyst .
```

The container listens on port `3000`.

## 2. Secrets and runtime configuration

Never bake credentials into the image. Configure environment variables only in the deployment platform.

Minimum private deployment:

- `APP_ACCESS_USER`
- `APP_ACCESS_PASSWORD`
- `TWELVE_DATA_API_KEY`
- `IOL_API_USERNAME`
- `IOL_API_PASSWORD`

Recommended for the full system:

- `ALPHA_VANTAGE_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `MONITOR_CRON_TOKEN`
- `ORDER_CONFIRMATION_SECRET` (24+ chars)
- Telegram and/or WhatsApp credentials
- CCL / metadata bridges when required

Keep `IOL_EXECUTION_MODE=disabled` on the first production deployment.

## 3. Readiness

After deployment open `/system` or query `/api/health` from an authenticated session. Do not activate the monitoring scheduler until the modules required for the intended workflow report READY.

## 4. Monitoring Agent

The scheduler must call:

`POST /api/monitor/scan`

with:

`Authorization: Bearer <MONITOR_CRON_TOKEN>`

The existing GitHub Actions monitor workflow can call the deployed URL once its URL/token secrets are configured. The application itself does not rely on an open browser to monitor positions.

## 5. Persistence

Redis REST is optional but recommended. When configured it provides:

- alert deduplication;
- bounded activity history;
- persisted Monitoring Agent alerts;
- persisted sandbox/order audit events.

`ACTIVITY_HISTORY_MAX_ITEMS` defaults to `1000`.

## 6. Order safety

The web application never places live orders in its current architecture.

- `disabled`: no validation/simulation.
- `sandbox`: broker validation + signed local simulation.
- `production`: validation/review only; live placement remains blocked.

Do not expose broker credentials to the browser. Any future live execution path must be designed and reviewed separately.

## 7. First production smoke test

1. Verify `/system`.
2. Analyze one ticker and confirm market-data source is not `demo`.
3. Load `/portfolio` and confirm IOL positions are normalized correctly.
4. Check CEDEAR ratio endpoint for one known ticker.
5. Confirm `/activity` reports persistence as configured.
6. Run one sandbox validation/simulation only after `IOL_EXECUTION_MODE=sandbox` and `ORDER_CONFIRMATION_SECRET` are configured.
7. Trigger the monitor manually once and verify a single deduplicated alert/history record.
8. Only then enable the recurring scheduler.
