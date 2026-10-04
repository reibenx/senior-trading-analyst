'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from '@/app/components/SandboxOrderLab.module.css';

interface ValidationResponse {
  valid?: boolean;
  mode?: string;
  simulationReady?: boolean;
  placementReady?: boolean;
  confirmationToken?: string;
  confirmationExpiresInSeconds?: number;
  confirmationUrl?: string;
  confirmationExpiresAt?: string;
  requiresDdjj?: boolean;
  ddjjUrl?: string;
  actionRequired?: string;
  messages?: string[];
  message?: string;
  error?: string;
}

interface SimulationResponse {
  simulated?: boolean;
  mode?: string;
  receiptId?: string;
  simulatedAt?: string;
  brokerValidated?: boolean;
  brokerValidationIdPresent?: boolean;
  message?: string;
  actionRequired?: string;
  confirmationUrl?: string;
  ddjjUrl?: string;
  messages?: string[];
  error?: string;
}

export function SandboxOrderLab() {
  const [asset, setAsset] = useState('NVDA');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);

  async function validate() {
    setLoading(true);
    setValidation(null);
    setSimulation(null);
    setConfirmed(false);
    try {
      const parsedQuantity = Number(quantity.replace(',', '.'));
      const parsedPrice = Number(limitPrice.replace(',', '.'));
      const response = await fetch('/api/orders/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset,
          market: 'BCBA',
          side: 'buy',
          type: limitPrice.trim() ? 'limit' : 'market',
          settlementTerm: 't1',
          quantity: parsedQuantity,
          ...(limitPrice.trim() ? { limitPrice: parsedPrice } : {}),
          rationale: 'Prueba de flujo sandbox desde Senior Trading Analyst',
        }),
      });
      setValidation(await response.json() as ValidationResponse);
    } catch (error) {
      setValidation({ error: error instanceof Error ? error.message : 'Error inesperado' });
    } finally {
      setLoading(false);
    }
  }

  async function simulate() {
    if (!validation?.confirmationToken || !confirmed) return;
    setSimulating(true);
    setSimulation(null);
    try {
      const response = await fetch('/api/orders/sandbox/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmationToken: validation.confirmationToken,
          explicitConfirmation: true,
        }),
      });
      setSimulation(await response.json() as SimulationResponse);
    } catch (error) {
      setSimulation({ error: error instanceof Error ? error.message : 'Error inesperado' });
    } finally {
      setSimulating(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <strong>SANDBOX DE ÓRDENES</strong>
        <span>Validación · Confirmación firmada · Simulación sin ejecución real</span>
        <Link className="topLink" href="/">Volver al analizador</Link>
      </header>

      <section className={styles.shell}>
        <section className={`panel ${styles.warning}`}>
          <strong>ENTORNO DE PRUEBA</strong>
          <p>Esta pantalla no coloca órdenes reales. En modo sandbox, el broker puede validar la orden; el paso final sólo genera un recibo simulado.</p>
        </section>

        <section className={`panel ${styles.form}`}>
          <label>Ticker CEDEAR
            <input value={asset} onChange={(event) => setAsset(event.target.value.toUpperCase())} maxLength={20} />
          </label>
          <label>Cantidad
            <input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <label>Precio límite ARS <small>(vacío = market para la validación)</small>
            <input inputMode="decimal" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value)} />
          </label>
          <button className="executionButton" onClick={validate} disabled={loading}>
            {loading ? 'Validando…' : 'Validar orden de prueba'}
          </button>
        </section>

        {validation ? (
          <section className={`panel ${styles.result}`}>
            <div className={styles.head}>
              <h2>Resultado de validación</h2>
              <span>{validation.valid ? 'VALID' : 'BLOCKED'}</span>
            </div>
            <p>Modo <b>{validation.mode ?? '—'}</b></p>
            <p>Simulación habilitada <b>{validation.simulationReady ? 'sí' : 'no'}</b></p>
            <p>Orden real habilitada <b>{validation.placementReady ? 'sí' : 'no'}</b></p>
            {validation.message ? <small>{validation.message}</small> : null}
            {validation.error ? <small>{validation.error}</small> : null}
            {validation.messages?.map((message) => <small key={message}>{message}</small>)}
            {validation.actionRequired ? <p>Acción externa requerida: <b>{validation.actionRequired}</b></p> : null}
            {validation.confirmationUrl ? <a href={validation.confirmationUrl} target="_blank" rel="noreferrer">Abrir confirmación del broker</a> : null}
            {validation.ddjjUrl ? <a href={validation.ddjjUrl} target="_blank" rel="noreferrer">Abrir DDJJ</a> : null}

            {validation.simulationReady && validation.confirmationToken ? (
              <div className={styles.confirmBox}>
                <label>
                  <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                  Confirmo que deseo simular esta orden. Entiendo que no se enviará al mercado.
                </label>
                <button className="executionButton" onClick={simulate} disabled={!confirmed || simulating}>
                  {simulating ? 'Revalidando y simulando…' : 'Confirmar simulación'}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {simulation ? (
          <section className={`panel ${styles.result}`}>
            <div className={styles.head}>
              <h2>Recibo sandbox</h2>
              <span>{simulation.simulated ? 'SIMULATED' : 'BLOCKED'}</span>
            </div>
            {simulation.receiptId ? <p>Receipt <b>{simulation.receiptId}</b></p> : null}
            {simulation.simulatedAt ? <p>Fecha <b>{new Date(simulation.simulatedAt).toLocaleString('es-AR')}</b></p> : null}
            <p>Broker revalidado <b>{simulation.brokerValidated ? 'sí' : 'no'}</b></p>
            {simulation.message ? <small>{simulation.message}</small> : null}
            {simulation.error ? <small>{simulation.error}</small> : null}
            {simulation.messages?.map((message) => <small key={message}>{message}</small>)}
          </section>
        ) : null}
      </section>
    </main>
  );
}
