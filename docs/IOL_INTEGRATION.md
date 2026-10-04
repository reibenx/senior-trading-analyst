# Integración segura con IOL

## Objetivo

Usar la cartera real como input del `Portfolio Engine` sin exponer credenciales del broker en el navegador ni almacenar datos personales en el repositorio.

## Arquitectura

```text
IOL / conector autorizado
        ↓
Server-side IOL Bridge
        ↓
BrokerAdapter (modelo normalizado)
        ↓
Portfolio Engine
        ↓
Portfolio Fit / concentración / decisión
```

La web nunca debe recibir usuario, contraseña, token de sesión ni credenciales del broker. El `BrokerAdapter` sólo consume posiciones ya normalizadas.

## Contrato normalizado

Cada posición se transforma al dominio interno:

```ts
{
  symbol: string;
  quantity: number;
  averagePrice?: number;
  marketValue?: number;
  currency: string;
  broker: 'IOL';
}
```

El bridge podrá añadir metadatos de mercado y convertir CEDEAR/subyacente cuando corresponda, pero el motor de cartera no dependerá del formato nativo de IOL.

## CEDEAR

Para un CEDEAR se deben mantener dos identidades:

- instrumento ejecutable en BYMA;
- activo subyacente utilizado para tendencia, fundamentales y valuación.

La relación debe vivir en una tabla de instrumentos, no hardcodeada dentro del Decision Engine.

## Seguridad

- credenciales sólo en secretos del entorno de ejecución;
- HTTPS obligatorio;
- token del bridge rotatorio;
- logs sin credenciales ni datos sensibles;
- endpoints de trading separados de endpoints de lectura;
- una recomendación nunca ejecuta por sí sola una orden real;
- cualquier futura operación debe requerir confirmación explícita del usuario.

## Integración con MCP

El MCP disponible dentro de ChatGPT puede utilizarse para consultar la cartera durante una conversación, pero una web-app desplegada necesita su propia integración server-side o un bridge autorizado. Por eso la arquitectura mantiene `BrokerAdapter` independiente del MCP y de cualquier proveedor concreto.
