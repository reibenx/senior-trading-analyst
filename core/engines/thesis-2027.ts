import type { Thesis2027Overlay, Thesis2027Profile } from '@/core/domain/thesis-2027';

const PROFILES: Record<string, Thesis2027Profile> = {
  TSM: {
    symbol: 'TSM',
    themes: ['AI_INFRASTRUCTURE'],
    stance: 'PRIORITY_ACCUMULATE',
    strategicAdjustment: 8,
    rationale: 'Prioridad de acumulación dentro de la tesis 2027.',
  },
  GOOGL: {
    symbol: 'GOOGL',
    themes: ['HYPERSCALERS'],
    stance: 'PRIORITY_ACCUMULATE',
    strategicAdjustment: 8,
    rationale: 'Prioridad de acumulación dentro de la tesis 2027.',
  },
  AVGO: {
    symbol: 'AVGO',
    themes: ['AI_INFRASTRUCTURE'],
    stance: 'ACCUMULATE_WATCH',
    strategicAdjustment: 4,
    rationale: 'Acumulación normal con vigilancia de valoración, demanda y ejecución.',
  },
  NVDA: {
    symbol: 'NVDA',
    themes: ['AI_INFRASTRUCTURE'],
    stance: 'ACCUMULATE_WATCH',
    strategicAdjustment: 4,
    rationale: 'Acumulación normal con vigilancia de valoración y continuidad de demanda IA.',
  },
  AMZN: {
    symbol: 'AMZN',
    themes: ['HYPERSCALERS'],
    stance: 'ACCUMULATE_WATCH',
    strategicAdjustment: 4,
    rationale: 'Acumulación normal con vigilancia de capex y monetización de infraestructura IA.',
  },
  META: {
    symbol: 'META',
    themes: ['HYPERSCALERS'],
    stance: 'NEUTRAL',
    strategicAdjustment: 0,
    rationale: 'Alineada con la tesis de hyperscalers, sin prioridad adicional explícita.',
  },
  VST: {
    symbol: 'VST',
    themes: ['POWER'],
    stance: 'HOLD',
    strategicAdjustment: 0,
    rationale: 'Mantener exposición del bloque de energía; no priorizar nuevo capital.',
  },
  CEG: {
    symbol: 'CEG',
    themes: ['POWER'],
    stance: 'HOLD',
    strategicAdjustment: 0,
    rationale: 'Mantener exposición del bloque de energía; no priorizar nuevo capital.',
  },
  SNDK: {
    symbol: 'SNDK',
    themes: ['AI_INFRASTRUCTURE'],
    stance: 'DO_NOT_ADD',
    strategicAdjustment: -8,
    rationale: 'No incrementar mientras se mantenga la política vigente de la tesis 2027.',
  },
  ETHA: {
    symbol: 'ETHA',
    themes: ['DIGITAL_ASSETS'],
    stance: 'DO_NOT_ADD',
    strategicAdjustment: -8,
    rationale: 'Mantener exposición sin incrementar mientras siga vigente la política actual.',
  },
  PLTR: {
    symbol: 'PLTR',
    themes: ['AI_SOFTWARE'],
    stance: 'DO_NOT_ADD',
    strategicAdjustment: -8,
    rationale: 'No incrementar mientras se mantenga la política vigente de la tesis 2027.',
  },
};

const THEME_ONLY: Record<string, Thesis2027Profile> = {
  MSFT: {
    symbol: 'MSFT',
    themes: ['HYPERSCALERS'],
    stance: 'NEUTRAL',
    strategicAdjustment: 0,
    rationale: 'Activo temáticamente alineado, sin directiva específica de asignación en la tesis actual.',
  },
  AMD: {
    symbol: 'AMD',
    themes: ['AI_INFRASTRUCTURE'],
    stance: 'NEUTRAL',
    strategicAdjustment: 0,
    rationale: 'Activo temáticamente alineado, sin directiva específica de asignación en la tesis actual.',
  },
};

export function getThesis2027Overlay(symbol: string): Thesis2027Overlay {
  const normalized = symbol.trim().toUpperCase();
  const profile = PROFILES[normalized] ?? THEME_ONLY[normalized] ?? {
    symbol: normalized,
    themes: ['OTHER'] as const,
    stance: 'NEUTRAL' as const,
    strategicAdjustment: 0,
    rationale: 'Sin directiva estratégica específica en la tesis 2027.',
  };

  return {
    symbol: normalized,
    themes: [...profile.themes],
    stance: profile.stance,
    strategicAdjustment: profile.strategicAdjustment,
    blocksNewCapital: profile.stance === 'HOLD' || profile.stance === 'DO_NOT_ADD',
    rationale: profile.rationale,
  };
}

export function listThesis2027Profiles(): Thesis2027Profile[] {
  return [...Object.values(PROFILES), ...Object.values(THEME_ONLY)];
}
