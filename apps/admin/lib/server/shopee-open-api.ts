import { createHmac } from 'node:crypto'

export type ShopeeModel = {
  itemId: string
  modelId: string
  sku: string | null
  currentPrice: number
  originalPrice: number
  currency: string | null
  status: string | null
  available: boolean
}

type Credentials = {
  partnerId?: string
  partnerKey?: string
  accessToken?: string
  shopId?: string
  apiBaseUrl?: string
}

const modelListPath = '/api/v2/product/get_model_list'

export function createShopeeOpenApiClient (credentials: Credentials) {
  const partnerId = credentials.partnerId ?? ''
  const partnerKey = credentials.partnerKey ?? ''
  const accessToken = credentials.accessToken ?? ''
  const shopId = credentials.shopId ?? ''
  const apiBaseUrl = (credentials.apiBaseUrl ?? 'https://partner.shopeemobile.com').replace(/\/$/, '')

  const configured = Boolean(partnerId && partnerKey && accessToken && shopId)

  return {
    configured,
    async getModelList (itemId: string): Promise<{ requestId: string | null, models: ShopeeModel[] }> {
      if (!configured) throw new Error('not_configured')
      if (!/^\d+$/.test(itemId)) throw new Error('invalid_item_id')

      const timestamp = Math.floor(Date.now() / 1000)
      const signBase = `${partnerId}${modelListPath}${timestamp}${accessToken}${shopId}`
      const sign = createHmac('sha256', partnerKey).update(signBase).digest('hex')
      const url = new URL(`${apiBaseUrl}${modelListPath}`)
      Object.entries({ partner_id: partnerId, timestamp, access_token: accessToken, shop_id: shopId, sign, item_id: itemId }).forEach(([key, value]) => url.searchParams.set(key, String(value)))

      const response = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (!response.ok || body?.error) throw new Error(body?.error || `http_${response.status}`)

      const models = Array.isArray(body?.response?.model) ? body.response.model : []
      return {
        requestId: body?.request_id ?? null,
        models: models.map((model: Record<string, unknown>) => {
          const priceInfo = Array.isArray(model.price_info) ? model.price_info[0] as Record<string, unknown> : model.price_info as Record<string, unknown> | undefined
          return {
            itemId,
            modelId: String(model.model_id),
            sku: typeof model.model_sku === 'string' ? model.model_sku : null,
            currentPrice: Number(priceInfo?.current_price),
            originalPrice: Number(priceInfo?.original_price),
            currency: typeof priceInfo?.currency === 'string' ? priceInfo.currency : null,
            status: typeof model.model_status === 'string' ? model.model_status : null,
            available: model.model_status === 'MODEL_NORMAL'
          }
        }).filter((model: ShopeeModel) => Number.isFinite(model.currentPrice))
      }
    }
  }
}
