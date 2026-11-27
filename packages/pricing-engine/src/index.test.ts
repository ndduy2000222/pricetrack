import { describe, expect, it } from 'vitest';
import { calculatePricingDecision } from './index.js';
import type { PricingInput } from './types.js';

const baseInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  now: new Date('2026-11-23T10:00:00.000Z'),
  currentPrice: 100_000,
  floorPrice: 80_000,
  ceilingPrice: 120_000,
  allowPriceIncrease: false,
  cooldownUntil: null,
  maxChangePerRun: 10_000,
  maxDailyChange: 20_000,
  dailyChangeSoFar: 0,
  maxObservationAgeMs: 15 * 60 * 1000,
  rule: { mode: 'amount', amount: 2_000 },
  observations: [
    {
      competitorId: 'c-1',
      itemId: 'item-1',
      modelId: 'model-red',
      price: 95_000,
      available: true,
      observedAt: new Date('2026-11-23T09:55:00.000Z'),
      source: 'fixture'
    },
    {
      competitorId: 'c-2',
      itemId: 'item-2',
      modelId: 'model-blue',
      price: 98_000,
      available: true,
      observedAt: new Date('2026-11-23T09:58:00.000Z'),
      source: 'fixture'
    }
  ],
  ...overrides
});

describe('calculatePricingDecision', () => {
  it('uses the lowest valid competitor and applies an amount rule', () => {
    const result = calculatePricingDecision(baseInput());

    expect(result.status).toBe('proposal');
    expect(result.referencePrice).toBe(95_000);
    expect(result.proposedPrice).toBe(93_000);
    expect(result.reasonCodes).toEqual(['TARGET_REACHED']);
  });

  it('applies a percentage rule and rounds to the configured increment', () => {
    const result = calculatePricingDecision(baseInput({
      rule: { mode: 'percent', percent: 0.05 },
      roundingIncrement: 50
    }));

    expect(result.proposedPrice).toBe(90_250);
  });

  it('clamps to the floor and explains why the target spread was not reached', () => {
    const result = calculatePricingDecision(baseInput({
      floorPrice: 94_000,
      rule: { mode: 'amount', amount: 2_000 }
    }));

    expect(result.proposedPrice).toBe(94_000);
    expect(result.reasonCodes).toContain('FLOOR_BLOCKS_TARGET');
  });

  it('blocks stale observations without changing the current price', () => {
    const result = calculatePricingDecision(baseInput({
      observations: [{
        competitorId: 'c-1', itemId: 'item-1', modelId: 'model-red', price: 70_000,
        available: true, observedAt: new Date('2026-11-23T09:00:00.000Z'), source: 'fixture'
      }]
    }));

    expect(result.status).toBe('blocked');
    expect(result.proposedPrice).toBe(100_000);
    expect(result.reasonCodes).toEqual(['NO_FRESH_COMPETITOR_DATA']);
  });

  it('does not increase price unless explicitly allowed', () => {
    const result = calculatePricingDecision(baseInput({
      currentPrice: 90_000,
      observations: [{
        competitorId: 'c-1', itemId: 'item-1', modelId: 'model-red', price: 110_000,
        available: true, observedAt: new Date('2026-11-23T09:55:00.000Z'), source: 'fixture'
      }],
      rule: { mode: 'amount', amount: 2_000 }
    }));

    expect(result.status).toBe('blocked');
    expect(result.proposedPrice).toBe(90_000);
    expect(result.reasonCodes).toEqual(['PRICE_INCREASE_DISABLED']);
  });

  it('blocks a change during cooldown or when the daily limit is exceeded', () => {
    const cooldown = calculatePricingDecision(baseInput({
      cooldownUntil: new Date('2026-11-23T10:05:00.000Z')
    }));
    const dailyLimit = calculatePricingDecision(baseInput({
      dailyChangeSoFar: 20_000
    }));

    expect(cooldown.reasonCodes).toEqual(['COOLDOWN_ACTIVE']);
    expect(dailyLimit.reasonCodes).toEqual(['DAILY_CHANGE_LIMIT_REACHED']);
  });
});
