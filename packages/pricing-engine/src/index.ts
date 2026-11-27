import type {
  CompetitorObservation,
  PricingDecision,
  PricingInput,
  ReasonCode
} from './types.js';

const isFresh = (observation: CompetitorObservation, input: PricingInput) => {
  const age = input.now.getTime() - observation.observedAt.getTime();
  return Number.isFinite(age) && age >= 0 && age <= input.maxObservationAgeMs;
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
): PricingDecision => {
  const safeCurrentPrice = Number.isFinite(input.currentPrice) ? input.currentPrice : 0;
  return {
    status: 'blocked',
    currentPrice: safeCurrentPrice,
    proposedPrice: safeCurrentPrice,
    referencePrice,
    reasonCodes,
    validObservationCount
  };
};

const hasValidBounds = (input: PricingInput) => (
  Number.isFinite(input.floorPrice)
  && Number.isFinite(input.ceilingPrice)
  && input.floorPrice >= 0
  && input.ceilingPrice >= 0
  && input.floorPrice <= input.ceilingPrice
);

const hasValidNumericInput = (input: PricingInput) => {
  const ruleValue = input.rule.mode === 'amount' ? input.rule.amount : input.rule.percent;
  return (
    Number.isFinite(input.now.getTime())
    && Number.isFinite(input.currentPrice)
    && Number.isFinite(input.maxChangePerRun)
    && input.maxChangePerRun >= 0
    && Number.isFinite(input.maxDailyChange)
    && input.maxDailyChange >= 0
    && Number.isFinite(input.dailyChangeSoFar)
    && input.dailyChangeSoFar >= 0
    && Number.isFinite(input.maxObservationAgeMs)
    && input.maxObservationAgeMs >= 0
    && Number.isFinite(ruleValue)
    && ruleValue >= 0
    && (input.rule.mode !== 'percent' || ruleValue <= 1)
    && (input.roundingIncrement === undefined || (Number.isFinite(input.roundingIncrement) && input.roundingIncrement >= 0))
  );
};

export const calculatePricingDecision = (input: PricingInput): PricingDecision => {
  if (!hasValidBounds(input)) {
    return blocked(input, ['INVALID_PRICE_BOUNDS'], null, 0);
  }

  if (!hasValidNumericInput(input)) {
    return blocked(input, ['INVALID_PRICING_INPUT'], null, 0);
  }

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

  if (!Number.isFinite(proposedPrice) || proposedPrice < input.floorPrice || proposedPrice > input.ceilingPrice) {
    return blocked(input, ['INVALID_PRICING_INPUT'], referencePrice, validObservations.length);
  }

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
