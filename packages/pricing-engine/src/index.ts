import type {
  CompetitorObservation,
  PricingDecision,
  PricingInput,
  ReasonCode
} from './types.js';

const isFresh = (observation: CompetitorObservation, input: PricingInput) => {
  const age = input.now.getTime() - observation.observedAt.getTime();
  return age >= 0 && age <= input.maxObservationAgeMs;
};

const roundToIncrement = (value: number, increment: number) => {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
};

const blocked = (
  input: PricingInput,
  reasonCodes: ReasonCode[],
  referencePrice: number | null,
  validObservationCount: number
): PricingDecision => ({
  status: 'blocked',
  currentPrice: input.currentPrice,
  proposedPrice: input.currentPrice,
  referencePrice,
  reasonCodes,
  validObservationCount
});

export const calculatePricingDecision = (input: PricingInput): PricingDecision => {
  const validObservations = input.observations.filter((observation) => (
    observation.itemId.length > 0
    && observation.modelId.length > 0
    && observation.source.length > 0
    && observation.available
    && Number.isFinite(observation.price)
    && observation.price > 0
    && isFresh(observation, input)
  ));

  if (validObservations.length === 0) {
    return blocked(input, ['NO_FRESH_COMPETITOR_DATA'], null, 0);
  }

  const referencePrice = Math.min(...validObservations.map((observation) => observation.price));

  if (input.cooldownUntil && input.cooldownUntil.getTime() > input.now.getTime()) {
    return blocked(input, ['COOLDOWN_ACTIVE'], referencePrice, validObservations.length);
  }

  const rawTarget = input.rule.mode === 'amount'
    ? referencePrice - input.rule.amount
    : referencePrice * (1 - input.rule.percent);
  const increment = input.roundingIncrement ?? 1;
  const roundedTarget = roundToIncrement(rawTarget, increment);
  const proposedPrice = Math.min(input.ceilingPrice, Math.max(input.floorPrice, roundedTarget));
  const reasonCodes: ReasonCode[] = [];

  if (roundedTarget < input.floorPrice) reasonCodes.push('FLOOR_BLOCKS_TARGET');
  if (roundedTarget > input.ceilingPrice) reasonCodes.push('CEILING_BLOCKS_TARGET');

  if (proposedPrice > input.currentPrice && !input.allowPriceIncrease) {
    return blocked(input, ['PRICE_INCREASE_DISABLED'], referencePrice, validObservations.length);
  }

  const change = Math.abs(proposedPrice - input.currentPrice);
  if (change > input.maxChangePerRun) {
    return blocked(input, ['MAX_CHANGE_PER_RUN_REACHED'], referencePrice, validObservations.length);
  }

  if (input.dailyChangeSoFar + change > input.maxDailyChange) {
    return blocked(input, ['DAILY_CHANGE_LIMIT_REACHED'], referencePrice, validObservations.length);
  }

  if (proposedPrice === input.currentPrice) {
    return blocked(input, [...reasonCodes, 'NO_CHANGE_NEEDED'], referencePrice, validObservations.length);
  }

  return {
    status: 'proposal',
    currentPrice: input.currentPrice,
    proposedPrice,
    referencePrice,
    reasonCodes: [...reasonCodes, 'TARGET_REACHED'],
    validObservationCount: validObservations.length
  };
};

export type { CompetitorObservation, PricingDecision, PricingInput, ReasonCode } from './types.js';
