const test = require('node:test')
const assert = require('node:assert/strict')
const { MODEL_LIST_PATH, buildShopeeSignature, createShopeeOpenApiClient } = require('../src/price-control/shopee-open-api-client')
const { createShopeeSellerAdapter } = require('../src/price-control/shopee-seller-adapter')

const credentials = { partnerId: '123', partnerKey: 'secret', accessToken: 'token', shopId: '456' }

test('builds the documented shop-level signature input', () => {
  assert.equal(
    buildShopeeSignature({ ...credentials, path: MODEL_LIST_PATH, timestamp: 1700000000 }),
    'c2e1a63ae3f941521094a501364c8cbb05dda0a0d6701768023078db9a4dc3dd'
  )
})

test('reads and normalizes model prices without exposing credentials', async () => {
  let requestUrl
  const client = createShopeeOpenApiClient({
    credentials,
    now: () => 1700000000000,
    fetchImpl: async (url) => {
      requestUrl = new URL(url)
      return { ok: true, status: 200, async json () { return { request_id: 'req-1', response: { model: [{ model_id: 99, model_sku: 'ABK-RED', model_status: 'MODEL_NORMAL', price_info: [{ current_price: 149000, original_price: 159000, currency: 'VND' }] }] } } } }
    }
  })
  const result = await client.getModelList('77')
  assert.equal(result.models[0].currentPrice, 149000)
  assert.equal(result.models[0].sku, 'ABK-RED')
  assert.equal(requestUrl.pathname, MODEL_LIST_PATH)
  assert.equal(requestUrl.searchParams.get('partner_key'), null)
  assert.equal(requestUrl.searchParams.get('access_token'), 'token')
  assert.equal(requestUrl.searchParams.has('sign'), true)
})

test('reports missing credentials without making a network request', async () => {
  const client = createShopeeOpenApiClient({ credentials: {} })
  assert.equal(client.status, 'not_configured')
  await assert.rejects(() => client.getModelList('77'), { code: 'not_configured' })
})

test('keeps seller writes disabled when credentials are absent', async () => {
  const adapter = createShopeeSellerAdapter({ credentials: {} })
  assert.equal(adapter.status, 'not_configured')
  assert.deepEqual(await adapter.writePromotion({}), { status: 'not_configured' })
})
