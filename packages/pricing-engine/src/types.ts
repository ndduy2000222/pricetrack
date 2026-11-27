export type PricingRule =
  | { mode: 'amount'; amount: number }
  | { mode: 'percent'; percent: number };

export type CompetitorObservation = {
  competitorId: string;
  itemId: string;
  modelId: string;
  price: number;
  available: boolean;
  observedAt: Date;
  source: string;
};

export type PricingInput = {
  now: Date;
  currentPrice: number;
  floorPrice: number;
  ceilingPrice: number;
  allowPriceIncrease: boolean;
  cooldownUntil: Date | null;
  maxChangePerRun: number;
  maxDailyChange: number;
  dailyChangeSoFar: number;
  maxObservationAgeMs: number;
  roundingIncrement?: number;
  rule: PricingRule;
  observations: CompetitorObservation[];
};

export type ReasonCode =
  | 'TARGET_REACHED'
  | 'FLOOR_BLOCKS_TARGET'
  | 'CEILING_BLOCKS_TARGET'
  | 'INVALID_PRICE_BOUNDS'
  | 'INVALID_PRICING_INPUT'
  | 'NO_FRESH_COMPETITOR_DATA'
  | 'PRICE_INCREASE_DISABLED'
  | 'COOLDOWN_ACTIVE'
  | 'MAX_CHANGE_PER_RUN_REACHED'
  | 'DAILY_CHANGE_LIMIT_REACHED'
  | 'NO_CHANGE_NEEDED';

export type PricingDecision = {
  status: 'proposal' | 'blocked';
  currentPrice: number;
  proposedPrice: number;
  referencePrice: number | null;
  reasonCodes: ReasonCode[];
  validObservationCount: number;
};
