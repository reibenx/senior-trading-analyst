import type { MonthlyAllocationPlan, PortfolioOpportunity } from '@/core/domain/opportunity';

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function buildMonthlyAllocationPlan(
  opportunities: PortfolioOpportunity[],
  capital: number,
  maxIdeas = 4,
): MonthlyAllocationPlan {
  const safeCapital = Math.max(0, capital);
  if (safeCapital <= 0) {
    return {
      capital: 0,
      currency: 'USD',
      allocated: 0,
      cashReserve: 0,
      items: [],
      notes: ['Ingresá un capital mensual positivo para generar una asignación.'],
    };
  }

  const eligible = opportunities
    .filter((item) => item.opportunityScore >= 62)
    .filter((item) => item.action === 'AUMENTAR' || item.action === 'COMPRAR_EN_PULLBACK')
    .filter((item) => item.currentWeightPercent < 20)
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, Math.max(1, Math.min(8, maxIdeas)));

  if (!eligible.length) {
    return {
      capital: safeCapital,
      currency: 'USD',
      allocated: 0,
      cashReserve: safeCapital,
      items: [],
      notes: [
        'No hay oportunidades que superen el umbral mínimo de score sin elevar demasiado la concentración.',
        'El capital se mantiene en reserva hasta que aparezca una mejor entrada.',
      ],
    };
  }

  const adjusted = eligible.map((item) => {
    const concentrationFactor = item.currentWeightPercent >= 15
      ? 0.45
      : item.currentWeightPercent >= 10
        ? 0.70
        : item.currentWeightPercent >= 7.5
          ? 0.85
          : 1;
    const pullbackFactor = item.action === 'COMPRAR_EN_PULLBACK' && (item.distanceToEntryPercent ?? 0) > 4 ? 0.75 : 1;
    const strength = Math.max(1, item.opportunityScore - 55) * concentrationFactor * pullbackFactor;
    return { item, strength };
  });

  const totalStrength = adjusted.reduce((sum, value) => sum + value.strength, 0);
  const raw = adjusted.map(({ item, strength }) => ({
    item,
    weight: totalStrength > 0 ? strength / totalStrength : 0,
  }));

  // Prevent a single idea from absorbing the full monthly contribution.
  const capped = raw.map(({ item, weight }) => ({ item, weight: Math.min(weight, 0.45) }));
  const cappedTotal = capped.reduce((sum, value) => sum + value.weight, 0);
  const normalized = capped.map(({ item, weight }) => ({
    item,
    weight: cappedTotal > 0 ? weight / cappedTotal : 0,
  }));

  const reserveRate = normalized.some(({ item }) => item.action === 'COMPRAR_EN_PULLBACK') ? 0.15 : 0.05;
  const investable = safeCapital * (1 - reserveRate);

  const items = normalized.map(({ item, weight }) => {
    const allocationAmount = round(investable * weight, 2);
    return {
      symbol: item.symbol,
      allocationPercent: round((allocationAmount / safeCapital) * 100, 1),
      allocationAmount,
      opportunityScore: item.opportunityScore,
      currentWeightPercent: item.currentWeightPercent,
      rationale: item.action === 'AUMENTAR'
        ? 'Score alto con concentración todavía compatible con una nueva compra.'
        : 'Tesis favorable, pero conviene reservar la ejecución para una zona de entrada más eficiente.',
    };
  });

  const allocated = round(items.reduce((sum, item) => sum + item.allocationAmount, 0), 2);
  const cashReserve = round(Math.max(0, safeCapital - allocated), 2);

  return {
    capital: safeCapital,
    currency: 'USD',
    allocated,
    cashReserve,
    items,
    notes: [
      'La asignación está expresada en USD de planificación; no convierte todavía a cantidad de CEDEARs.',
      'La ejecución en BYMA requerirá CCL y ratio de conversión vigente para cada CEDEAR.',
      'Se mantiene una reserva cuando alguna idea requiere pullback en vez de compra inmediata.',
    ],
  };
}
