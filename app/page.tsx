const scores = [
  ['Técnico', 86], ['Fundamental', 89], ['Valuación', 68], ['Mercado', 81], ['Riesgo / Retorno', 77], ['Convicción', 84]
];

export default function Home() {
  return (
    <main>
      <header className="topbar"><strong>SENIOR TRADING ANALYST</strong><span>Market intelligence · Portfolio · Risk</span></header>
      <section className="shell">
        <aside className="panel controls">
          <h2>Configurar análisis</h2>
          <label>Ticker<input defaultValue="NVDA" /></label>
          <label>Estrategia<select defaultValue="swing"><option value="day">Day Trading</option><option value="swing">Swing Trading</option><option value="position">Position Trading</option></select></label>
          <label>Capital disponible<input defaultValue="5000" /></label>
          <label>Riesgo máximo<input defaultValue="1.0%" /></label>
          <button>Analizar</button>
          <div className="status"><b>IOL Portfolio</b><span>Adapter preparado</span></div>
          <div className="status"><b>Monitoring Agent</b><span>Arquitectura 24/7</span></div>
        </aside>

        <section className="workspace">
          <div className="panel chart">
            <div className="chartHead"><div><b>NVDA</b><small> Swing · 1D</small></div><span>Subyacente USD + ejecución CEDEAR</span></div>
            <div className="mockChart"><div className="target t2">TP2</div><div className="target t1">TP1</div><div className="priceLine">PRECIO</div><div className="zone a">ENTRY A</div><div className="zone b">ENTRY B</div><div className="stop">STOP / INVALIDACIÓN</div></div>
          </div>
          <div className="scoreGrid">{scores.map(([name, value]) => <div className="panel score" key={name}><span>{name}</span><strong>{value}</strong></div>)}</div>
        </section>

        <aside className="panel decision">
          <span className="eyebrow">DECISIÓN</span><h1>MANTENER</h1><h3>Aumentar en pullback</h3><div className="conviction">Convicción <b>84/100</b></div>
          <hr/><h3>Plan</h3><p>Entry A <b>$ —</b></p><p>Entry B <b>$ —</b></p><p>Stop <b>$ —</b></p><p>TP1 / TP2 <b>$ —</b></p>
          <hr/><h3>Qué invalida la tesis</h3><p>Ruptura estructural, deterioro fundamental o cambio relevante del régimen de mercado.</p>
          <hr/><h3>Alertas</h3><p>Telegram · WhatsApp · Push mediante providers desacoplados.</p>
        </aside>
      </section>
    </main>
  );
}
