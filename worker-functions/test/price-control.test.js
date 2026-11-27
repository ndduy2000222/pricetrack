const assert = require('node:assert/strict')
const test = require('node:test')
const { createFixtureCompetitorSource } = require('../src/price-control/competitor-source')
const { runPricingCycle } = require('../src/price-control/run-pricing-cycle')

const model = { id: 'model-1', currentPrice: 100000, paused: false }
const proposal = { status: 'proposal', currentPrice: 100000, proposedPrice: 98000, referencePrice: 99000, reasonCodes: ['TARGET_REACHED'] }

const setup = (overrides = {}) => {
  const writes = []
  const sellerAdapter = {
    async readCurrent() { return { status: 'ok', price: 100000 } },
    async writePromotion(payload) { writes.push(payload); return { status: 'ok' } },
    async readBack() { return { status: 'ok', price: 98000 } }
  }
  return { writes, sellerAdapter, ...overrides }
}

test('monitor persists a decision but never writes a promotion', async () => {
  const { writes, sellerAdapter } = setup()
  const results = await runPricingCycle({
    models: [model],
    competitorSource: createFixtureCompetitorSource({ 'model-1': [] }),
    sellerAdapter,
    buildPricingInput: () => ({}),
    calculateDecision: () => proposal,
    mode: 'monitor'
  })

  assert.equal(results[0].decision.status, 'proposal')
  assert.equal(writes.length, 0)
})

test('auto re-checks current price, writes once, and verifies by reading back', async () => {
  const { writes, sellerAdapter } = setup()
  const results = await runPricingCycle({
    models: [model],
    competitorSource: createFixtureCompetitorSource(),
    sellerAdapter,
    buildPricingInput: () => ({}),
    calculateDecision: () => proposal,
    mode: 'auto'
  })

  assert.equal(writes.length, 1)
  assert.equal(writes[0].proposedPrice, 98000)
  assert.deepEqual(results[0].execution, { status: 'succeeded', price: 98000 })
})

test('auto stops before writing when the stop switch is active', async () => {
  const { writes, sellerAdapter } = setup()
  const results = await runPricingCycle({
    models: [model],
    competitorSource: createFixtureCompetitorSource(),
    sellerAdapter,
    buildPricingInput: () => ({}),
    calculateDecision: () => proposal,
    mode: 'auto',
    isStopped: async () => true
  })

  assert.equal(writes.length, 0)
  assert.deepEqual(results[0].execution, { status: 'stopped', reasonCodes: ['STOP_SWITCH_ACTIVE'] })
})

test('auto does not retry blindly when current price changed', async () => {
  const { writes, sellerAdapter } = setup({
    sellerAdapter: {
      async readCurrent() { return { status: 'ok', price: 101000 } },
      async writePromotion(payload) { writes.push(payload); return { status: 'ok' } },
      async readBack() { return { status: 'ok', price: 98000 } }
    }
  })
  const results = await runPricingCycle({
    models: [model],
    competitorSource: createFixtureCompetitorSource(),
    sellerAdapter,
    buildPricingInput: () => ({}),
    calculateDecision: () => proposal,
    mode: 'auto'
  })

  assert.equal(writes.length, 0)
  assert.equal(results[0].execution.reasonCodes[0], 'CURRENT_PRICE_CHANGED')
})

test('paused models do not collect evidence or attempt execution', async () => {
  let collected = 0
  let writes = 0
  const results = await runPricingCycle({
    models: [{ ...model, paused: true }],
    competitorSource: { async collect() { collected += 1; return [] } },
    sellerAdapter: { async readCurrent() { throw new Error('should not read') }, async writePromotion() { writes += 1; return { status: 'ok' } }, async readBack() { throw new Error('should not read back') } },
    buildPricingInput: () => ({}),
    calculateDecision: () => proposal,
    mode: 'auto'
  })

  assert.equal(collected, 0)
  assert.equal(writes, 0)
  assert.deepEqual(results[0].decision.reasonCodes, ['SKU_PAUSED'])
})
