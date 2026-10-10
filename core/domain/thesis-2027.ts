export type Thesis2027Theme =
  | 'AI_INFRASTRUCTURE'
  | 'HYPERSCALERS'
  | 'POWER'
  | 'DIGITAL_ASSETS'
  | 'AI_SOFTWARE'
  | 'OTHER';

export type Thesis2027Stance =
  | 'PRIORITY_ACCUMULATE'
  | 'ACCUMULATE_WATCH'
  | 'HOLD'
  | 'DO_NOT_ADD'
  | 'NEUTRAL';

export interface Thesis2027Profile {
  symbol: string;
  themes: Thesis2027Theme[];
  stance: Thesis2027Stance;
  strategicAdjustment: number;
  rationale: string;
}

export interface Thesis2027Overlay {
  symbol: string;
  themes: Thesis2027Theme[];
  stance: Thesis2027Stance;
  strategicAdjustment: number;
  blocksNewCapital: boolean;
  rationale: string;
}
