'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '@/app/components/SystemReadiness.module.css';

interface ModuleState {
  ready?: boolean;
  mode?: string;
  validationEnabled?: boolean;
  simulationEnabled?: boolean;
  placementEnabled?: boolean;
  confirmationSecretReady?: boolean;
  reason?: string;
  impliedCableCcl?: boolean;
  globalCclBenchmark?: boolean;
  officialSource?: boolean;
  purpose?: string;
}

interface HealthResponse {
  ok: boolean;
  criticalReady: boolean;
  generatedAt: string;
  modules: Record<string, ModuleState | boolean>;
}

function moduleLabel(key: string) {
  const labels: Record<string, string> = {
    appAuth: 'Acceso privado',
    marketData: 'Market Data',
    fundamentals: 'Fundamentales',
    iolPortfolio: 'IOL · Cartera',
    iolQuotes: 'IOL · Cotizaciones',
    iolAssetMetadata: 'IOL · Especies relacionadas',
    cedearRatios: 'Ratios CEDEAR',
    iolOrders: 'IOL · Órdenes',
    orderAudit: 'Auditoría de órdenes',
    activityHistory: 'Historial persistente',
    cedearConversion: 'Conversión CEDEAR / CCL',
    alertState: 'Estado de alertas / Redis',
    telegram: 'Telegram',
    whatsapp: 'WhatsApp',
    monitorCron: 'Monitor 24/7',
  };
  return labels[key] ?? key;
}

export function SystemReadiness() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const payload = await response.json() as HealthResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'No fue posible consultar el estado del sistema.');
      setHealth(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return (
    <main>
      <header className="topbar">
        <strong>ESTADO DEL SISTEMA</strong>
        <span>Providers · Seguridad · Ejecución · Monitoring Agent</span>
        <Link className="topLink" href="/">Volver al analizador</Link>
      </header>

      <section className="portfolioShell">
        <section className={`panel ${styles.hero}`}>
          <div>
            <span className="eyebrow">READINESS</span>
            <h1>{health?.criticalReady ? 'Núcleo listo' : 'Configuración incompleta'}</h1>
            <p>Esta pantalla sólo informa disponibilidad. No expone tokens, claves, usuarios ni credenciales.</p>
          </div>
          <button className="executionButton" onClick={refresh} disabled={loading}>
            {loading ? 'Verificando…' : 'Actualizar estado'}
          </button>
        </section>

        {error ? <section className="panel portfolioError">{error}</section> : null}

        {health ? (
          <>
            <section className={styles.grid}>
              {Object.entries(health.modules).map(([key, raw]) => {
                const state: ModuleState = typeof raw === 'boolean' ? { ready: raw } : raw;
                const ready = Boolean(state.ready);
                return (
                  <article className={`panel ${styles.card} ${ready ? styles.ready : styles.pending}`} key={key}>
                    <div className={styles.head}>
                      <strong>{moduleLabel(key)}</strong>
                      <span>{ready ? 'READY' : 'PENDING'}</span>
                    </div>
                    {state.mode ? <p>Modo <b>{state.mode}</b></p> : null}
                    {state.validationEnabled !== undefined ? <p>Validación <b>{state.validationEnabled ? 'habilitada' : 'bloqueada'}</b></p> : null}
                    {state.simulationEnabled !== undefined ? <p>Simulación <b>{state.simulationEnabled ? 'habilitada' : 'bloqueada'}</b></p> : null}
                    {state.placementEnabled !== undefined ? <p>Orden real <b>{state.placementEnabled ? 'habilitada' : 'bloqueada'}</b></p> : null}
                    {state.confirmationSecretReady !== undefined ? <p>Firma de confirmación <b>{state.confirmationSecretReady ? 'lista' : 'pendiente'}</b></p> : null}
                    {state.officialSource !== undefined ? <p>Fuente oficial <b>{state.officialSource ? 'sí' : 'no'}</b></p> : null}
                    {state.impliedCableCcl !== undefined ? <p>CCL por especie cable <b>{state.impliedCableCcl ? 'disponible' : 'no disponible'}</b></p> : null}
                    {state.globalCclBenchmark !== undefined ? <p>Benchmark CCL <b>{state.globalCclBenchmark ? 'disponible' : 'no disponible'}</b></p> : null}
                    {state.purpose ? <small>{state.purpose}</small> : null}
                    {state.reason ? <small>{state.reason}</small> : null}
                  </article>
                );
              })}
            </section>
            <p className={styles.timestamp}>Última verificación: {new Date(health.generatedAt).toLocaleString('es-AR')}</p>
          </>
        ) : null}
      </section>
    </main>
  );
}
