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

`POST /api/monitor/scan` construye automáticamente análisis y Trade Plans para posiciones del broker y símbolos adicionales de `MONITOR_WATCHLIST`. También rota un lote pequeño de `MARKET_SCANNER_UNIVERSE` (2 símbolos por defecto), calcula un prefiltro técnico barato, conserva historial de score y clasifica el momentum como `ACCELERATING`, `STABLE` o `DETERIORATING`. Los candidatos se ordenan por score, delta y persistencia; sólo los mejores hasta `MARKET_SCANNER_PROMOTION_LIMIT` pasan al análisis completo. El endpoint requiere `Authorization: Bearer <MONITOR_CRON_TOKEN>`.

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


El historial del scanner conserva hasta 8 observaciones por activo durante 7 días en Redis. Un cambio de score de al menos +5 se clasifica como **ACCELERATING** y de -5 o menos como **DETERIORATING**; el resto queda **STABLE**. La UI de Oportunidades muestra esta señal junto con el score del scanner, delta y número de observaciones.


### Scanner confirmation gate

To reduce one-cycle false positives, scanner discoveries normally require repeated confirmation before the expensive full analysis. By default `MARKET_SCANNER_MIN_CONFIRMATIONS=2`. Candidates with `DETERIORATING` momentum are never promoted. Exceptionally strong candidates can use `MARKET_SCANNER_FAST_TRACK_SCORE=85` to bypass the confirmation count, provided they are not deteriorating. Promotion capacity remains bounded by `MARKET_SCANNER_PROMOTION_LIMIT`.


## Tesis de cartera 2027

La app incorpora una capa estratégica separada del timing táctico. La tesis central es **AI Infrastructure + Power + Digital Assets** y se aplica como overlay auditable sobre el ranking transversal.

La capa 2027 puede ajustar el score entre -8 y +8 puntos y bloquear nuevo capital cuando la postura estratégica es `HOLD` o `DO_NOT_ADD`. Los activos sin directiva explícita quedan neutrales: el sistema no inventa una tesis.

Posturas iniciales:
- `PRIORITY_ACCUMULATE`: TSM, GOOGL.
- `ACCUMULATE_WATCH`: AVGO, NVDA, AMZN.
- `HOLD`: VST, CEG.
- `DO_NOT_ADD`: SNDK, ETHA, PLTR.
- META conserva alineación temática con hyperscalers pero sin ajuste de asignación.

La vista `/thesis-2027` cruza la postura estratégica con la cartera IOL y el ranking vivo. El panel de Oportunidades muestra además el overlay Tesis 2027 dentro de cada activo.


### Tesis 2027 viva

La capa estratégica ahora tiene un componente dinámico basado en evidencia ya calculada por el Senior Trading Analyst. Se consideran los scores de fundamentales, valoración, contexto de mercado y convicción. El ajuste dinámico está acotado entre -4 y +4 y el ajuste final de tesis entre -10 y +10.

Estados:
- `CONFIRMED`: la evidencia fortalece materialmente la tesis.
- `MIXED`: la evidencia no cambia materialmente la convicción.
- `WEAK`: la evidencia debilita materialmente la tesis.
- `INSUFFICIENT`: no hay cobertura suficiente para alterar la tesis.

La capa dinámica sólo se aplica a activos pertenecientes al universo temático explícito de la Tesis 2027. Activos fuera de ese universo permanecen neutrales y no reciben ajuste estratégico por tener buenos scores generales.


### Eventos y catalizadores de la Tesis 2027

La capa viva incorpora ahora una segunda fuente de evidencia basada en eventos. Para los activos del universo explícito de la tesis, cuando reciben análisis completo se consultan noticias recientes y calendario de earnings mediante el proveedor de insights configurado. El resultado queda almacenado junto con la oportunidad en cache, evitando repetir consultas en cada lectura del ranking.

Reglas principales:
- Noticias de hasta 14 días y relevancia mínima suficiente pueden aportar un ajuste entre -2 y +2.
- Earnings próximos no se interpretan direccionalmente. Si faltan 7 días o menos, se aplica una penalización de volatilidad de -1; entre 8 y 30 días se registra sólo como catalizador a monitorear.
- La evidencia de eventos nunca sustituye la tesis fundamental: su impacto está limitado y el ajuste estratégico total permanece acotado entre -10 y +10.
- Si no hay evidencia usable, el estado es `INSUFFICIENT` y el ajuste de eventos es 0.


### Señales estructuradas de Tesis 2027

La tesis incorpora cuatro canales heurísticos y auditables sobre evidencia ya disponible:
- `GUIDANCE`: detecta subas o recortes explícitos de guidance/outlook/forecast.
- `ANALYST_REVISION`: detecta upgrades/downgrades o cambios explícitos de rating.
- `PRICE_TARGET`: compara el precio objetivo de consenso disponible con el precio actual; >=20% de upside suma y <=-10% de downside resta.
- `CAPEX_AI`: detecta aceleración o recorte explícito de capex, infraestructura IA, data centers o demanda GPU/IA.

Cada canal aporta como máximo +1 o -1; el agregado estructurado está acotado entre -3 y +3. Las reglas son determinísticas y guardan la evidencia textual que disparó cada señal.


### Historial y cambio de régimen de Tesis 2027

La app persiste hasta 24 observaciones por ticker durante 90 días. Cada observación registra el ajuste estratégico final, estado de evidencia, estado de eventos y contribuciones dinámica, de eventos y estructurada.

Se deriva una tendencia:
- `STRENGTHENING`: el ajuste sube 2 puntos o más frente a la observación anterior.
- `STABLE`: variación menor a 2 puntos.
- `WEAKENING`: el ajuste cae 2 puntos o más.

También se marca `regimeChanged` cuando cambia el estado de evidencia, por ejemplo `CONFIRMED → WEAK`. Un cambio de régimen o una variación absoluta de 3 puntos o más genera una señal estratégica del monitor, con deduplicación y notificación por los proveedores configurados.

El historial completo puede consultarse por ticker en `GET /api/thesis-2027/history?symbol=TSM`.
