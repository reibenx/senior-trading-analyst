export interface PositionSizingInput {
  capital: number;
  riskPercent: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  maxPositionPercent?: number;
}

export interface PositionSizingResult {
  riskBudget: number;
  riskPerUnit: number;
  quantity: number;
  positionValue: number;
  capitalUtilizationPercent: number;
  rewardPerUnit?: number;
  riskReward?: number;
}

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function calculatePositionSizing(input: PositionSizingInput): PositionSizingResult | null {
  const { capital, riskPercent, entryPrice, stopPrice, targetPrice, maxPositionPercent } = input;

  if (!finitePositive(capital) || !finitePositive(riskPercent) || !finitePositive(entryPrice) || !Number.isFinite(stopPrice)) return null;
  if (riskPercent > 100 || stopPrice < 0 || stopPrice >= entryPrice) return null;
  if (maxPositionPercent !== undefined && (!finitePositive(maxPositionPercent) || maxPositionPercent > 100)) return null;

  const riskBudget = capital * (riskPercent / 100);
  const riskPerUnit = entryPrice - stopPrice;
  const quantityByRisk = Math.floor(riskBudget / riskPerUnit);
  const quantityByCapital = Math.floor(capital / entryPrice);
  const allocationCapital = maxPositionPercent === undefined ? capital : capital * (maxPositionPercent / 100);
  const quantityByAllocation = Math.floor(allocationCapital / entryPrice);
  const quantity = Math.max(0, Math.min(quantityByRisk, quantityByCapital, quantityByAllocation));
  const positionValue = quantity * entryPrice;

  const result: PositionSizingResult = {
    riskBudget: round(riskBudget),
    riskPerUnit: round(riskPerUnit),
    quantity,
    positionValue: round(positionValue),
    capitalUtilizationPercent: capital > 0 ? round((positionValue / capital) * 100, 1) : 0,
  };

  if (targetPrice !== undefined && Number.isFinite(targetPrice) && targetPrice > entryPrice) {
    const rewardPerUnit = targetPrice - entryPrice;
    result.rewardPerUnit = round(rewardPerUnit);
    result.riskReward = round(rewardPerUnit / riskPerUnit, 2);
  }

  return result;
}
