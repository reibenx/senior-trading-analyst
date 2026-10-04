# Senior Trading Analyst

Plataforma modular para análisis técnico, fundamental, riesgo y cartera, con soporte para monitoreo 24/7 y adaptadores de broker/notificaciones.

## Principios de arquitectura

- Datos, análisis y decisión desacoplados.
- Proveedores intercambiables mediante adapters.
- Estrategias configurables: Day, Swing y Position.
- Recomendaciones auditables con condiciones de invalidación.
- La automatización de órdenes queda separada de las recomendaciones y requiere confirmación explícita.
- No se inventan datos: si un proveedor no está configurado, el dashboard lo informa y mantiene ese score como no disponible o neutral provisional.

## Estado actual

- Dashboard responsive e interactivo.
- Selector de ticker, estrategia y timeframe.
- Candlestick chart propio con overlays técnicos.
- EMA20/50/200, RSI14, ATR14, soportes/resistencias y estructura HH/HL - LH/LL.
- Zonas Entry A / Entry B, stop técnico y TP1 / TP2.
- Risk Engine: riesgo monetario, position sizing y R/R.
- Scoring Engine con pesos específicos para Day, Swing y Position.
- Decision Engine con razones y advertencias auditables.
- MarketDataProvider real mediante Twelve Data con fallback demo.
- FundamentalDataProvider mediante Alpha Vantage Company Overview.
- CI: typecheck + production build en cada push.

## Configuración

1. Copiar `.env.example` a `.env.local`.
2. Para OHLCV real, definir `TWELVE_DATA_API_KEY`.
3. Para fundamentales reales, definir `ALPHA_VANTAGE_API_KEY`.
4. Mantener todas las credenciales fuera del repositorio. `.gitignore` excluye los archivos `.env` reales.

`MARKET_DATA_PROVIDER=auto` utiliza Twelve Data cuando existe API key y, de lo contrario, conserva el fixture demo para desarrollo.

## Arquitectura

- `app/`: web app y API routes.
- `core/domain/`: contratos y tipos de dominio.
- `core/engines/`: technical, fundamental, risk, scoring y decision engines.
- `core/adapters/`: interfaces para market data, fundamentals, brokers y notificaciones.
- `core/providers/`: implementaciones concretas de proveedores externos.
- `core/monitoring/`: agente 24/7 y reglas de alertas.

## Próximas etapas

1. Market Context Engine: SPY/QQQ, sector, VIX, tasas y régimen de mercado.
2. Portfolio Engine e integración segura con IOL.
3. Portfolio Fit: concentración, correlación y exposición factorial.
4. Monitoring Agent 24/7 con persistencia de señales.
5. Telegram / WhatsApp / push notifications.
6. Earnings, noticias y catalizadores.
7. Backtesting, métricas por estrategia y auditoría histórica de señales.

> Proyecto en construcción. Los análisis son herramientas de apoyo a decisiones y no implican ejecución automática de operaciones.
