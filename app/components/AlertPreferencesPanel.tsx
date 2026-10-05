'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from '@/app/components/AlertPreferencesPanel.module.css';

type Strategy = 'day' | 'swing' | 'position';
type Decision = 'STRONG_ADD' | 'ADD' | 'TAKE_PROFIT' | 'REDUCE' | 'EXIT';

interface AlertPreferences {
  minConviction: number;
  strategies: Strategy[];
  entryA: boolean;
  entryB: boolean;
  targetHits: boolean;
  stopBreach: boolean;
  decisions: Record<Decision, boolean>;
}

const DEFAULTS: AlertPreferences = {
  minConviction: 60,
  strategies: ['day', 'swing', 'position'],
  entryA: true,
  entryB: true,
  targetHits: true,
  stopBreach: true,
  decisions: {
    STRONG_ADD: true,
    ADD: true,
    TAKE_PROFIT: true,
    REDUCE: true,
    EXIT: true,
  },
};

const DECISION_LABELS: Record<Decision, string> = {
  STRONG_ADD: 'AUMENTAR FUERTE',
  ADD: 'AUMENTAR',
  TAKE_PROFIT: 'TOMAR GANANCIAS',
  REDUCE: 'REDUCIR',
  EXIT: 'SALIR / REVISAR TESIS',
};

export function AlertPreferencesPanel() {
  const [preferences, setPreferences] = useState<AlertPreferences>(DEFAULTS);
  const [persistent, setPersistent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/alerts/preferences', { cache: 'no-store' });
      const payload = await response.json() as { preferences?: AlertPreferences; persistent?: boolean; error?: string };
      if (!response.ok || !payload.preferences) throw new Error(payload.error ?? 'No fue posible cargar las preferencias.');
      setPreferences(payload.preferences);
      setPersistent(Boolean(payload.persistent));
      setDirty(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar preferencias.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const enabledDecisions = useMemo(
    () => Object.values(preferences.decisions).filter(Boolean).length,
    [preferences.decisions],
  );

  function update<K extends keyof AlertPreferences>(key: K, value: AlertPreferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setMessage(null);
  }

  function toggleStrategy(strategy: Strategy) {
    const exists = preferences.strategies.includes(strategy);
    const next = exists
      ? preferences.strategies.filter((item) => item !== strategy)
      : [...preferences.strategies, strategy];
    if (!next.length) return;
    update('strategies', next);
  }

  function toggleDecision(decision: Decision) {
    update('decisions', { ...preferences.decisions, [decision]: !preferences.decisions[decision] });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/alerts/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });
      const payload = await response.json() as { preferences?: AlertPreferences; persistent?: boolean; error?: string };
      if (!response.ok || !payload.preferences) throw new Error(payload.error ?? 'No fue posible guardar las preferencias.');
      setPreferences(payload.preferences);
      setPersistent(Boolean(payload.persistent));
      setDirty(false);
      setMessage('Configuración guardada. El próximo ciclo del monitor utilizará estos filtros.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al guardar preferencias.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <div>
          <span className={styles.eyebrow}>CONTROL DE SEÑALES · MONITOR 24/7</span>
          <h1>Centro de Alertas</h1>
          <p>Filtrá ruido sin perder eventos de riesgo. La convicción mínima aplica a entradas y decisiones discrecionales; el stop técnico se controla por separado.</p>
        </div>
        <div className={styles.status}>
          <b>{persistent ? 'PERSISTENTE' : 'FALLBACK'}</b>
          <span>{persistent ? 'Redis conectado' : 'Usando valores por defecto'}</span>
        </div>
      </div>

      <div className={styles.grid}>
        <article className={styles.card}>
          <h2>Umbral de calidad</h2>
          <div className={styles.conviction}>
            <strong>{preferences.minConviction}</strong><small>/100</small>
          </div>
          <input
            aria-label="Convicción mínima"
            type="range"
            min="0"
            max="100"
            step="5"
            value={preferences.minConviction}
            onChange={(event) => update('minConviction', Number(event.target.value))}
          />
          <p>Recomendación senior: 60–70 para evitar señales marginales sin volver demasiado lento el sistema.</p>
        </article>

        <article className={styles.card}>
          <h2>Estrategias vigiladas</h2>
          <div className={styles.buttonGrid}>
            {(['day','swing','position'] as Strategy[]).map((strategy) => (
              <button key={strategy} type="button" className={preferences.strategies.includes(strategy) ? styles.active : ''} onClick={() => toggleStrategy(strategy)}>
                {strategy === 'day' ? 'Day' : strategy === 'swing' ? 'Swing' : 'Position'}
              </button>
            ))}
          </div>
          <p>Al menos una estrategia debe permanecer activa.</p>
        </article>

        <article className={styles.card}>
          <h2>Zonas y niveles</h2>
          <label><input type="checkbox" checked={preferences.entryA} onChange={(event) => update('entryA', event.target.checked)} /><span>Entrada A</span><small>Zona razonable / conservadora</small></label>
          <label><input type="checkbox" checked={preferences.entryB} onChange={(event) => update('entryB', event.target.checked)} /><span>Entrada B</span><small>Zona óptima / mayor confluencia</small></label>
          <label><input type="checkbox" checked={preferences.targetHits} onChange={(event) => update('targetHits', event.target.checked)} /><span>TP alcanzado</span><small>Evento objetivo de gestión</small></label>
          <label className={styles.critical}><input type="checkbox" checked={preferences.stopBreach} onChange={(event) => update('stopBreach', event.target.checked)} /><span>Stop vulnerado</span><small>Protección de riesgo · no depende de convicción</small></label>
        </article>

        <article className={styles.card}>
          <h2>Decisiones accionables</h2>
          {(Object.keys(DECISION_LABELS) as Decision[]).map((decision) => (
            <label key={decision}>
              <input type="checkbox" checked={preferences.decisions[decision]} onChange={() => toggleDecision(decision)} />
              <span>{DECISION_LABELS[decision]}</span>
            </label>
          ))}
          <p>{enabledDecisions}/5 decisiones habilitadas.</p>
        </article>
      </div>

      <div className={styles.footer}>
        <div>
          <b>Política activa</b>
          <span>{preferences.strategies.join(' · ')} · convicción ≥ {preferences.minConviction} · Telegram sólo recibe señales que pasan este filtro.</span>
        </div>
        <button type="button" className={styles.secondary} onClick={() => { setPreferences(DEFAULTS); setDirty(true); setMessage(null); }} disabled={loading || saving}>Restaurar recomendado</button>
        <button type="button" className={styles.primary} onClick={save} disabled={loading || saving || !dirty}>{saving ? 'Guardando…' : dirty ? 'Guardar configuración' : 'Guardado'}</button>
      </div>
      {message ? <p className={styles.message}>{message}</p> : null}
    </section>
  );
}
