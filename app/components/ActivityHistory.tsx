'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from '@/app/components/ActivityHistory.module.css';

interface ActivityRecord {
  id: string;
  kind: 'ALERT' | 'ORDER_AUDIT' | 'DECISION' | 'SIGNAL';
  createdAt: string;
  symbol?: string;
  title: string;
  detail?: string;
  severity?: string;
  metadata?: Record<string, unknown>;
}

interface ActivityResponse {
  configured: boolean;
  records: ActivityRecord[];
  message?: string;
}

export function ActivityHistory() {
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [configured, setConfigured] = useState(true);
  const [kind, setKind] = useState('ALL');
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/activity?limit=250', { cache: 'no-store' });
      const payload = await response.json() as ActivityResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'No fue posible consultar el historial.');
      setConfigured(payload.configured);
      setRecords(payload.records ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => records.filter((record) => {
    if (kind !== 'ALL' && record.kind !== kind) return false;
    if (symbol.trim() && record.symbol?.toUpperCase() !== symbol.trim().toUpperCase()) return false;
    return true;
  }), [records, kind, symbol]);

  return (
    <main>
      <header className="topbar">
        <strong>HISTORIAL Y AUDITORÍA</strong>
        <span>Alertas · Señales · Decisiones · Sandbox</span>
        <Link className="topLink" href="/">Volver al analizador</Link>
      </header>

      <section className={styles.shell}>
        <section className={`panel ${styles.toolbar}`}>
          <div className={styles.field}>
            <label htmlFor="kind">Tipo</label>
            <select id="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="ALL">Todos</option>
              <option value="ALERT">Alertas</option>
              <option value="ORDER_AUDIT">Sandbox / órdenes</option>
              <option value="SIGNAL">Señales</option>
              <option value="DECISION">Decisiones</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="symbol">Ticker</label>
            <input id="symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="NVDA" />
          </div>
          <button className="executionButton" onClick={refresh} disabled={loading}>
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </section>

        {!configured ? <section className={`panel ${styles.empty}`}>Persistencia no configurada. Agregá Redis REST para conservar historial.</section> : null}
        {error ? <section className="panel portfolioError">{error}</section> : null}

        <section className={styles.grid}>
          {filtered.map((record) => {
            const severity = record.severity?.toUpperCase() ?? '';
            const severityClass = severity === 'CRITICAL' ? styles.critical : severity === 'WARNING' || severity === 'ACTION' ? styles.warning : '';
            return (
              <article className={`panel ${styles.card} ${severityClass}`} key={record.id}>
                <div className={styles.head}>
                  <strong>{record.title}</strong>
                  <span className={styles.badge}>{record.kind}</span>
                </div>
                <div className={styles.meta}>
                  {record.symbol ? <span>{record.symbol}</span> : null}
                  {record.severity ? <span>{record.severity}</span> : null}
                  <span>{new Date(record.createdAt).toLocaleString('es-AR')}</span>
                </div>
                {record.detail ? <p className={styles.detail}>{record.detail}</p> : null}
              </article>
            );
          })}
          {!loading && configured && filtered.length === 0 ? <div className={`panel ${styles.empty}`}>No hay eventos para estos filtros.</div> : null}
        </section>
      </section>
    </main>
  );
}
