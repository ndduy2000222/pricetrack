const crypto = require('node:crypto')

const MODEL_LIST_PATH = '/api/v2/product/get_model_list'

const createShopeeApiError = (message, code = 'shopee_api_error') => {
  const error = new Error(message)
  error.code = code
  return error
}

const buildShopeeSignature = ({ partnerId, partnerKey, path, timestamp, accessToken, shopId }) => {
  const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}`
  return crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex')
}

const createShopeeOpenApiClient = ({ credentials, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) => {
  const partnerId = String(credentials?.partnerId || '')
  const partnerKey = String(credentials?.partnerKey || '')
  const accessToken = String(credentials?.accessToken || '')
  const shopId = String(credentials?.shopId || '')
  const apiBaseUrl = String(credentials?.apiBaseUrl || 'https://partner.shopeemobile.com').replace(/\/$/, '')

  if (!partnerId || !partnerKey || !accessToken || !shopId) {
    return {
      status: 'not_configured',
      async getModelList () { throw createShopeeApiError('Shopee credentials are not configured', 'not_configured') },
      async readCurrent () { return { status: 'not_configured' } },
      async readBack () { return { status: 'not_configured' } }
    }
  }

  if (typeof fetchImpl !== 'function') {
    throw createShopeeApiError('A fetch implementation is required', 'fetch_unavailable')
  }

  const request = async (path, params) => {
    const timestamp = Math.floor(now() / 1000)
    const url = new URL(`${apiBaseUrl}${path}`)
    const sign = buildShopeeSignature({ partnerId, partnerKey, path, timestamp, accessToken, shopId })
    const query = {
      partner_id: partnerId,
      timestamp: String(timestamp),
      access_token: accessToken,
      shop_id: shopId,
      sign,
      ...params
    }

    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)))
    const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' } })
    let body
    try {
      body = await response.json()
    } catch {
      throw createShopeeApiError('Shopee returned an invalid JSON response', 'invalid_json')
    }

    if (!response.ok || body?.error) {
      throw createShopeeApiError(body?.message || `Shopee request failed with HTTP ${response.status}`, body?.error || `http_${response.status}`)
    }
    return body
  }

  const getModelList = async (itemId) => {
    const normalizedItemId = String(itemId || '')
    if (!/^\d+$/.test(normalizedItemId)) throw createShopeeApiError('itemId must be numeric', 'invalid_item_id')
    const body = await request(MODEL_LIST_PATH, { item_id: normalizedItemId })
    const models = Array.isArray(body?.response?.model) ? body.response.model : []
    return {
      requestId: body.request_id || null,
      itemId: normalizedItemId,
      models: models.map((model) => {
        const priceInfo = Array.isArray(model.price_info) ? model.price_info[0] : model.price_info
        return {
          itemId: normalizedItemId,
          modelId: String(model.model_id),
          sku: model.model_sku || null,
          currentPrice: Number(priceInfo?.current_price),
          originalPrice: Number(priceInfo?.original_price),
          currency: priceInfo?.currency || null,
          status: model.model_status || null,
          available: model.model_status === 'MODEL_NORMAL',
          promotionId: model.promotion_id ? String(model.promotion_id) : null
        }
      })
    }
  }

  const readCurrent = async (model) => {
    const result = await getModelList(model.externalItemId || model.itemId)
    const found = result.models.find((candidate) => candidate.modelId === String(model.externalModelId || model.modelId))
    if (!found || !Number.isFinite(found.currentPrice)) {
      return { status: 'invalid_data', modelId: model.id, requestId: result.requestId }
    }
    return { status: 'ok', price: found.currentPrice, available: found.available, requestId: result.requestId, observedAt: new Date(now()).toISOString(), raw: found }
  }

  return {
    status: 'read_only',
    getModelList,
    readCurrent,
    readBack: readCurrent
  }
}

const credentialsFromEnv = (env = process.env) => ({
  partnerId: env.SHOPEE_PARTNER_ID,
  partnerKey: env.SHOPEE_PARTNER_KEY,
  accessToken: env.SHOPEE_ACCESS_TOKEN,
  shopId: env.SHOPEE_SHOP_ID,
  apiBaseUrl: env.SHOPEE_API_BASE_URL
})

module.exports = {
  MODEL_LIST_PATH,
  buildShopeeSignature,
  createShopeeOpenApiClient,
  credentialsFromEnv
}
