import type { Thesis2027Overlay } from '@/core/domain/thesis-2027';

export type Thesis2027EvidenceStatus = 'CONFIRMED' | 'MIXED' | 'WEAK' | 'INSUFFICIENT';

export interface Thesis2027EvidenceInput {
  fundamentalScore?: number;
  valuationScore?: number;
  marketScore?: number;
  convictionScore?: number;
}

export interface LiveThesis2027Assessment {
  status: Thesis2027EvidenceStatus;
  dynamicAdjustment: number;
  finalAdjustment: number;
  evidenceCoverage: number;
  reasons: string[];
}

function isInformative(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value !== 50;
}

export function assessLiveThesis2027(
  overlay: Thesis2027Overlay,
  evidence: Thesis2027EvidenceInput,
): LiveThesis2027Assessment {
  const values = [
    evidence.fundamentalScore,
    evidence.valuationScore,
    evidence.marketScore,
    evidence.convictionScore,
  ];
  const informative = values.filter(isInformative).length;
  const evidenceCoverage = Math.round((informative / values.length) * 100);

  if (informative < 2) {
    return {
      status: 'INSUFFICIENT',
      dynamicAdjustment: 0,
      finalAdjustment: overlay.strategicAdjustment,
      evidenceCoverage,
      reasons: ['Cobertura insuficiente para alterar dinámicamente la tesis.'],
    };
  }

  let dynamicAdjustment = 0;
  const reasons: string[] = [];

  if (isInformative(evidence.fundamentalScore)) {
    if ((evidence.fundamentalScore ?? 50) >= 72) {
      dynamicAdjustment += 2;
      reasons.push('Fundamentales confirman la tesis.');
    } else if ((evidence.fundamentalScore ?? 50) <= 42) {
      dynamicAdjustment -= 3;
      reasons.push('Fundamentales debilitan la tesis.');
    }
  }

  if (isInformative(evidence.valuationScore)) {
    if ((evidence.valuationScore ?? 50) >= 68) {
      dynamicAdjustment += 1;
      reasons.push('Valuación aporta margen de seguridad.');
    } else if ((evidence.valuationScore ?? 50) <= 35) {
      dynamicAdjustment -= 2;
      reasons.push('Valuación exigente reduce convicción.');
    }
  }

  if (isInformative(evidence.marketScore)) {
    if ((evidence.marketScore ?? 50) >= 70) {
      dynamicAdjustment += 1;
      reasons.push('Contexto de mercado acompaña.');
    } else if ((evidence.marketScore ?? 50) <= 35) {
      dynamicAdjustment -= 1;
      reasons.push('Contexto de mercado adverso.');
    }
  }

  if (isInformative(evidence.convictionScore)) {
    if ((evidence.convictionScore ?? 50) >= 78) {
      dynamicAdjustment += 1;
      reasons.push('Convicción táctica alta.');
    } else if ((evidence.convictionScore ?? 50) <= 40) {
      dynamicAdjustment -= 2;
      reasons.push('Convicción táctica baja.');
    }
  }

  dynamicAdjustment = Math.max(-4, Math.min(4, dynamicAdjustment));
  const finalAdjustment = Math.max(-10, Math.min(10, overlay.strategicAdjustment + dynamicAdjustment));

  const status: Thesis2027EvidenceStatus = dynamicAdjustment >= 2
    ? 'CONFIRMED'
    : dynamicAdjustment <= -2
      ? 'WEAK'
      : 'MIXED';

  return {
    status,
    dynamicAdjustment,
    finalAdjustment,
    evidenceCoverage,
    reasons: reasons.length ? reasons : ['La evidencia disponible no cambia materialmente la tesis.'],
  };
}
