const blockedDecision = (model, reasonCodes, referencePrice = null) => ({
  status: 'blocked',
  currentPrice: model.currentPrice,
  proposedPrice: model.currentPrice,
  referencePrice,
  reasonCodes
})

const runPricingCycle = async ({
  models,
  competitorSource,
  sellerAdapter,
  buildPricingInput,
  calculateDecision,
  mode = 'monitor',
  isStopped = async () => false,
  persistDecision = async () => {},
  persistExecution = async () => {}
}) => {
  const results = []

  for (const model of models) {
    let decision
    if (model.paused) {
      decision = blockedDecision(model, ['SKU_PAUSED'])
    } else {
      const observations = await competitorSource.collect(model)
      const input = buildPricingInput(model, observations)
      decision = calculateDecision(input)
    }

    await persistDecision(model, decision)

    const result = { modelId: model.id, decision, execution: null }
    if (mode !== 'auto' || decision.status !== 'proposal') {
      results.push(result)
      continue
    }

    if (await isStopped(model)) {
      result.execution = { status: 'stopped', reasonCodes: ['STOP_SWITCH_ACTIVE'] }
      await persistExecution(model, decision, result.execution)
      results.push(result)
      continue
    }

    const current = await sellerAdapter.readCurrent(model)
    if (current.status !== 'ok' || current.price !== decision.currentPrice) {
      result.execution = {
        status: 'blocked',
        reasonCodes: ['CURRENT_PRICE_CHANGED', current.status]
      }
      await persistExecution(model, decision, result.execution)
      results.push(result)
      continue
    }

    const write = await sellerAdapter.writePromotion({
      model,
      expectedCurrentPrice: decision.currentPrice,
      proposedPrice: decision.proposedPrice
    })
    if (write.status !== 'ok') {
      result.execution = { status: 'failed', reasonCodes: [write.status] }
      await persistExecution(model, decision, result.execution)
      results.push(result)
      continue
    }

    const readBack = await sellerAdapter.readBack(model)
    result.execution = readBack.status === 'ok' && readBack.price === decision.proposedPrice
      ? { status: 'succeeded', price: readBack.price }
      : { status: 'unknown', reasonCodes: ['READ_BACK_MISMATCH'] }
    await persistExecution(model, decision, result.execution)
    results.push(result)
  }

  return results
}

module.exports = { runPricingCycle }
