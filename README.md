# Senior Trading Analyst

Plataforma modular para análisis técnico, fundamental, riesgo y cartera, con soporte para monitoreo 24/7 y adaptadores de broker/notificaciones.

## Principios de arquitectura

- Datos, análisis y decisión desacoplados.
- Proveedores intercambiables mediante adapters.
- Estrategias configurables: Day, Swing y Position.
- Recomendaciones auditables con condiciones de invalidación.
- La automatización de órdenes queda separada de las recomendaciones y requiere confirmación explícita.

## Módulos iniciales

- `app/`: web app y API.
- `core/domain/`: contratos y tipos de dominio.
- `core/engines/`: technical, fundamental, risk, portfolio, scoring y decision engines.
- `core/adapters/`: interfaces para market data, fundamentals, brokers y notificaciones.
- `core/monitoring/`: agente 24/7 y reglas de alertas.

## Roadmap MVP

1. Dashboard responsive y selector ticker/estrategia.
2. Chart adapter con overlays técnicos.
3. Technical + Risk + Scoring engines.
4. Portfolio adapter para IOL.
5. Fundamental + Market Context engines.
6. Monitoring Agent 24/7.
7. Telegram/WhatsApp adapters.
8. Backtesting y auditoría histórica de señales.

> Proyecto en construcción. Los análisis son herramientas de apoyo a decisiones y no implican ejecución automática de operaciones.
