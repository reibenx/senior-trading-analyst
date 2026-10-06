# Senior Trading Analyst

Plataforma modular para análisis técnico, fundamental, riesgo y cartera, con soporte para monitoreo 24/7 y adaptadores de broker/notificaciones.

## Principios de arquitectura

- Datos, análisis y decisión desacoplados.
- Proveedores intercambiables mediante adapters.
- Estrategias configurables: Day, Swing y Position.
- Recomendaciones auditables con condiciones de invalidación.
- La automatización de órdenes queda separada de las recomendaciones y requiere confirmación explícita.
- No se inventan datos: si un proveedor no está configurado, el dashboard lo informa y mantiene ese score como no disponible o neutral provisional.
- Credenciales y datos de cartera permanecen fuera del repositorio.

## Estado actual

- Dashboard responsive e interactivo.
- Selector de ticker, estrategia y timeframe.
- Candlestick chart propio con overlays técnicos automáticos.
- EMA20/50/200, RSI14, ATR14, soportes/resistencias y estructura HH/HL - LH/LL.
- Trendlines automáticas de soporte y resistencia proyectadas desde pivotes.
- Fibonacci 38.2%, 50% y 61.8% sobre el último swing significativo.
- VWAP 20 en marcos intradía compatibles.
- Zonas Entry A / Entry B, stop técnico y TP1 / TP2.
- Risk Engine: riesgo monetario, position sizing y R/R.
- Scoring Engine con pesos específicos para Day, Swing y Position.
- Decision Engine con razones y advertencias auditables.
- MarketDataProvider real mediante Twelve Data con fallback demo.
- FundamentalDataProvider mediante Alpha Vantage Company Overview.
- Market Context Engine con benchmark SPY y ETF sectorial cuando existe sector identificable.
- Portfolio Fit Engine con concentración actual y detección de posición existente.
- BrokerAdapter para un bridge IOL server-side sin exponer credenciales al navegador.
- API normalizada de cartera y API de Portfolio Fit.
- Trade Plan builder reutilizable por dashboard y monitor.
- Monitoring Agent con reglas Entry Zone, Stop Breach y Target Hit.
- Telegram Bot y WhatsApp Cloud como NotificationProvider intercambiables.
- Deduplicación persistente opcional de alertas mediante Redis REST.
- Scanner autónomo de cartera + watchlist.
- Market Scanner rotativo y quota-aware para descubrir candidatos fuera de cartera/watchlist con prefiltro técnico.
- GitHub Actions programado cada 15 minutos para activar el scanner una vez desplegada la app.
- CI: typecheck + production build en cada push.

## Configuración

1. Copiar `.env.example` a `.env.local`.
2. Para OHLCV real, definir `TWELVE_DATA_API_KEY`.
3. Para fundamentales reales, definir `ALPHA_VANTAGE_API_KEY`.
4. Para cartera real, desplegar/configurar el bridge IOL y definir `IOL_BRIDGE_URL` + `IOL_BRIDGE_TOKEN`.
5. Para monitoreo, definir `MONITOR_CRON_TOKEN` y la watchlist/estrategia correspondiente.
6. Para evitar alertas repetidas, configurar `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` o implementar otro `AlertStateStore`.
7. Configurar Telegram y/o WhatsApp mediante las variables listadas en `.env.example`.
8. Mantener todas las credenciales fuera del repositorio. `.gitignore` excluye los archivos `.env` reales.

`MARKET_DATA_PROVIDER=auto` utiliza Twelve Data cuando existe API key y, de lo contrario, conserva el fixture demo para desarrollo.

## Monitoreo 24/7

`POST /api/monitor/scan` construye automáticamente análisis y Trade Plans para posiciones del broker y símbolos adicionales de `MONITOR_WATCHLIST`. También rota un lote pequeño de `MARKET_SCANNER_UNIVERSE` (2 símbolos por defecto), calcula un prefiltro técnico barato y sólo promueve al análisis completo los candidatos que superan `MARKET_SCANNER_MIN_SCORE`. El endpoint requiere `Authorization: Bearer <MONITOR_CRON_TOKEN>`.

`.github/workflows/monitor.yml` llama al scanner cada 15 minutos cuando los secrets `APP_BASE_URL` y `MONITOR_CRON_TOKEN` están configurados en GitHub.

Las alertas se deduplican mediante una clave estable por símbolo/evento/nivel cuando existe un `AlertStateStore` persistente.

## Arquitectura

- `app/`: web app y API routes.
- `core/domain/`: contratos y tipos de dominio.
- `core/engines/`: technical, fundamental, risk, market context, portfolio fit, scoring y decision engines.
- `core/adapters/`: interfaces para market data, fundamentals, brokers, charting y notificaciones.
- `core/providers/`: implementaciones concretas de proveedores externos.
- `core/services/`: casos de uso reutilizables, análisis de símbolos y construcción de Trade Plans.
- `core/monitoring/`: agente 24/7, reglas y estado de deduplicación.

## Siguientes etapas

1. Despliegue productivo y capa de acceso al dashboard.
2. Bridge IOL real con normalización CEDEAR/subyacente, ratios y CCL para comparar ARS/USD correctamente.
3. Vista completa “Mi cartera IOL” y ranking de oportunidades para nuevas compras mensuales.
4. VIX, tasas, DXY y contexto macro adicional.
5. Earnings, noticias, revisiones de estimaciones y catalizadores.
6. Persistencia de watchlists, señales, decisiones y resultados históricos.
7. Backtesting, métricas por estrategia y auditoría de señales.
8. Ejecución de órdenes sólo bajo confirmación explícita del usuario.

> Proyecto en construcción. Los análisis son herramientas de apoyo a decisiones y no implican ejecución automática de operaciones.


### Market Scanner

El scanner externo está activo por defecto y usa un universo líquido y acotado cuando `MARKET_SCANNER_UNIVERSE` está vacío. Puede desactivarse con `MARKET_SCANNER_ENABLED=false`.

La rotación usa un cursor Redis independiente cuando Upstash está configurado. Los candidatos que no superan el prefiltro no consumen el análisis completo. Los promovidos se almacenan en el mismo cache de oportunidades y aparecen en Oportunidades como **NUEVA OPORTUNIDAD**. El universo completo permanece como referencia de cobertura para que los descubrimientos cacheados no desaparezcan al rotar el lote.
