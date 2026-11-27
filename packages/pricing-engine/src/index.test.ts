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

  it('blocks observations from the future instead of treating them as fresh', () => {
    const result = calculatePricingDecision(baseInput({
      observations: [{
        competitorId: 'c-future', itemId: 'item-1', modelId: 'model-red', price: 70_000,
        available: true, observedAt: new Date('2026-11-23T10:01:00.000Z'), source: 'fixture'
      }]
    }));

    expect(result.status).toBe('blocked');
    expect(result.validObservationCount).toBe(0);
    expect(result.reasonCodes).toEqual(['NO_FRESH_COMPETITOR_DATA']);
  });

  it('ignores non-positive and non-finite competitor prices', () => {
    const result = calculatePricingDecision(baseInput({
      observations: [
        { competitorId: 'zero', itemId: 'item-1', modelId: 'model-red', price: 0, available: true, observedAt: new Date('2026-11-23T09:55:00.000Z'), source: 'fixture' },
        { competitorId: 'negative', itemId: 'item-1', modelId: 'model-red', price: -1, available: true, observedAt: new Date('2026-11-23T09:55:00.000Z'), source: 'fixture' },
        { competitorId: 'nan', itemId: 'item-1', modelId: 'model-red', price: Number.NaN, available: true, observedAt: new Date('2026-11-23T09:55:00.000Z'), source: 'fixture' },
        { competitorId: 'valid', itemId: 'item-1', modelId: 'model-red', price: 95_000, available: true, observedAt: new Date('2026-11-23T09:55:00.000Z'), source: 'fixture' }
      ]
    }));

    expect(result.status).toBe('proposal');
    expect(result.referencePrice).toBe(95_000);
    expect(result.validObservationCount).toBe(1);
  });

  it('blocks NaN and invalid price bounds without producing a proposal', () => {
    const invalidFloor = calculatePricingDecision(baseInput({ floorPrice: Number.NaN }));
    const invertedBounds = calculatePricingDecision(baseInput({ floorPrice: 130_000, ceilingPrice: 120_000 }));
    const invalidRule = calculatePricingDecision(baseInput({ rule: { mode: 'amount', amount: Number.NaN } }));

    expect(invalidFloor.status).toBe('blocked');
    expect(invalidFloor.reasonCodes).toEqual(['INVALID_PRICE_BOUNDS']);
    expect(invertedBounds.status).toBe('blocked');
    expect(invertedBounds.reasonCodes).toEqual(['INVALID_PRICE_BOUNDS']);
    expect(invalidRule.status).toBe('blocked');
    expect(invalidRule.reasonCodes).toEqual(['INVALID_PRICING_INPUT']);
    expect(Number.isNaN(invalidRule.proposedPrice)).toBe(false);
  });

  it('keeps proposals inside both configured bounds', () => {
    const lower = calculatePricingDecision(baseInput({
      floorPrice: 94_000,
      rule: { mode: 'amount', amount: 100_000 }
    }));
    const upper = calculatePricingDecision(baseInput({
      ceilingPrice: 94_000,
      allowPriceIncrease: true,
      rule: { mode: 'amount', amount: 0 }
    }));

    expect(lower.status).toBe('proposal');
    expect(lower.proposedPrice).toBeGreaterThanOrEqual(94_000);
    expect(lower.proposedPrice).toBeLessThanOrEqual(120_000);
    expect(upper.status).toBe('proposal');
    expect(upper.proposedPrice).toBeGreaterThanOrEqual(80_000);
    expect(upper.proposedPrice).toBeLessThanOrEqual(94_000);
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
