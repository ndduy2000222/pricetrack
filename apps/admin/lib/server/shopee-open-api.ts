import { createHmac } from 'node:crypto'
import { ShopeeSDK, type AccessToken, type TokenStorage } from '@congminh1254/shopee-sdk'

export type ShopeeModel = {
  itemId: string
  modelId: string
  sku: string | null
  currentPrice: number | null
  originalPrice: number | null
  currency: string | null
  status: string | null
  available: boolean
  stock: number | null
  modelName: string | null
  imageUrl: string | null
  imageId: string | null
}

export type ShopeeItem = {
  itemId: string
  itemSku: string | null
  name: string | null
  status: string | null
  categoryId: string | null
  hasModel: boolean
  condition: string | null
  price: number | null
  originalPrice: number | null
  currency: string | null
  stock: number | null
  attributes: Record<string, string>
  imageUrl: string | null
  imageId: string | null
  createTime: string | null
  updateTime: string | null
}

export type ShopeeTokenSet = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  accessTokenExpiresAt: string
  requestId: string | null
}

type Credentials = {
  partnerId?: string
  partnerKey?: string
  accessToken?: string
  refreshToken?: string
  accessTokenExpiresAt?: string
  shopId?: string
  apiBaseUrl?: string
  onTokensRefreshed?: (tokens: ShopeeTokenSet) => Promise<void> | void
}

type TokenSnapshot = {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string | null
  requestId: string
}

export type DiscountItemUpdate = {
  item_id: number
  item_promotion_price?: number
  purchase_limit?: number
  model_list?: Array<{ model_id: number, model_promotion_price: number }>
}

export function classifyShopeeError (error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/refresh_token/i.test(message)) return 'refresh_token_not_configured'
  if (/access_token|invalid token|token.*expired/i.test(message)) return 'reauthorization_required'
  return 'shopee_api_error'
}

const DEFAULT_API_ROOT = 'https://partner.shopeemobile.com'
const AUTH_PARTNER_PATH = '/api/v2/shop/auth_partner'

const asRecord = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {}
const numberOrNull = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null
const stringOrNull = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value : null
const booleanValue = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true'

function stringList (value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : []
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => stringList(entry))
}

function imageUrlFromId (imageId: string | null) {
  return imageId ? `https://cf.shopee.vn/file/${encodeURIComponent(imageId)}` : null
}

function normaliseApiBaseUrl (value?: string) {
  const raw = (value ?? DEFAULT_API_ROOT).replace(/\/$/, '')
  return /\/api\/v2$/i.test(raw) ? raw : `${raw}/api/v2`
}

function timestampToIso (value: unknown) {
  const number = numberOrNull(value)
  if (number === null || number <= 0) return null
  return new Date(number > 10_000_000_000 ? number : number * 1000).toISOString()
}

function priceInfo (value: unknown) {
  const record = Array.isArray(value) ? asRecord(value[0]) : asRecord(value)
  return { current: numberOrNull(record.current_price), original: numberOrNull(record.original_price), currency: stringOrNull(record.currency) }
}

function readStock (value: Record<string, any>): number | null {
  const direct = numberOrNull(value.stock)
  if (direct !== null) return direct
  const summary = asRecord(asRecord(value.stock_info_v2).summary_info)
  return numberOrNull(summary.total_available_stock)
}

function readAttributes (value: unknown): Record<string, string> {
  const attributes: Record<string, string> = {}
  if (!Array.isArray(value)) return attributes
  for (const rawAttribute of value) {
    const attribute = asRecord(rawAttribute)
    const name = stringOrNull(attribute.original_attribute_name) ?? stringOrNull(attribute.attribute_name)
    const values = Array.isArray(attribute.attribute_value_list) ? attribute.attribute_value_list : []
    const first = asRecord(values[0])
    const text = stringOrNull(first.original_value_name) ?? stringOrNull(first.value_name) ?? stringOrNull(attribute.value)
    if (name && text) attributes[name] = text
  }
  return attributes
}

function readProductImage (item: Record<string, any>) {
  const image = asRecord(item.image)
  const imageUrls = stringList(image.image_url_list).filter((url) => /^https?:\/\//i.test(url))
  const imageIds = stringList(image.image_id_list)
  return { imageUrl: imageUrls[0] ?? imageUrlFromId(imageIds[0] ?? null), imageId: imageIds[0] ?? null }
}

function readModelImage (model: Record<string, any>, tierVariations: any[]) {
  const selectedOptions = Array.isArray(model.tier_index)
    ? model.tier_index.map((index: unknown, tierIndex: number) => {
      const tier = asRecord(tierVariations[tierIndex])
      return Array.isArray(tier.option_list) ? asRecord(tier.option_list[Number(index)]) : {}
    })
    : []
  const selectedImages = selectedOptions.map((option) => asRecord(asRecord(option).image)).filter((image) => Object.keys(image).length > 0)
  const image = selectedImages.find((entry) => stringOrNull(entry.image_url) || stringOrNull(entry.image_id)) ?? {}
  const imageId = stringOrNull(image.image_id)
  return { imageUrl: stringOrNull(image.image_url) ?? imageUrlFromId(imageId), imageId }
}

function readModelName (model: Record<string, any>, tierVariations: any[]) {
  if (stringOrNull(model.model_name)) return stringOrNull(model.model_name)
  if (!Array.isArray(model.tier_index) || !Array.isArray(tierVariations)) return null
  const parts = model.tier_index.map((index: unknown, tierIndex: number) => {
    const tier = asRecord(tierVariations[tierIndex])
    const option = Array.isArray(tier.option_list) ? asRecord(tier.option_list[Number(index)]) : {}
    const name = stringOrNull(option.option); const tierName = stringOrNull(tier.name)
    return name ? (tierName ? `${tierName}: ${name}` : name) : null
  }).filter((part): part is string => Boolean(part))
  return parts.length ? parts.join(' · ') : null
}

class EncryptedShopeeTokenStorage implements TokenStorage {
  private current: AccessToken | null

  constructor (private readonly shopId: string, initial: { accessToken?: string, refreshToken?: string, accessTokenExpiresAt?: string }, private readonly onStored?: (token: AccessToken) => Promise<void>) {
    this.current = initial.accessToken || initial.refreshToken ? this.toAccessToken(initial) : null
  }

  private toAccessToken (token: { accessToken?: string, refreshToken?: string, accessTokenExpiresAt?: string, expiresIn?: number, requestId?: string | null }): AccessToken {
    const hasAccessToken = Boolean(token.accessToken)
    const parsedExpiresAt = token.accessTokenExpiresAt ? Date.parse(token.accessTokenExpiresAt) : Number.NaN
    const expiresAt = hasAccessToken ? (Number.isFinite(parsedExpiresAt) ? parsedExpiresAt : Date.now() + Math.max(0, (token.expiresIn ?? 3600) - 60) * 1000) : Date.now() - 1
    return { access_token: token.accessToken ?? '', refresh_token: token.refreshToken ?? '', expire_in: hasAccessToken ? (token.expiresIn ?? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))) : 0, request_id: token.requestId ?? '', error: '', message: '', shop_id: Number(this.shopId), expired_at: expiresAt }
  }

  async store (token: AccessToken) {
    this.current = token
    await this.onStored?.(token)
  }

  async get () { return this.current }
  async clear () { this.current = null }
  snapshot () { return this.current }
}

function tokenSetFromSdkToken (token: AccessToken): ShopeeTokenSet {
  const expiresIn = Number(token.expire_in)
  const expiresAt = Number.isFinite(Number(token.expired_at)) && Number(token.expired_at) > 0 ? Number(token.expired_at) : Date.now() + Math.max(0, (Number.isFinite(expiresIn) ? expiresIn : 0) - 60) * 1000
  return { accessToken: token.access_token, refreshToken: token.refresh_token, expiresIn: Number.isFinite(expiresIn) ? expiresIn : 0, accessTokenExpiresAt: new Date(expiresAt).toISOString(), requestId: stringOrNull(token.request_id) }
}

function sdkConfig (credentials: Credentials) {
  const partnerId = Number(credentials.partnerId ?? ''); const partnerKey = credentials.partnerKey ?? ''; const shopId = Number(credentials.shopId ?? '')
  return { partner_id: partnerId, partner_key: partnerKey, shop_id: shopId, base_url: normaliseApiBaseUrl(credentials.apiBaseUrl), timeout_ms: 30_000, retry: { retries: 2, min_delay_ms: 500, max_delay_ms: 5_000 } } as const
}

export function createShopeeAuthorizationUrl (options: { partnerId?: string, partnerKey?: string, redirectUri: string, apiBaseUrl?: string }) {
  const partnerId = options.partnerId ?? process.env.SHOPEE_PARTNER_ID ?? ''; const partnerKey = options.partnerKey ?? process.env.SHOPEE_PARTNER_KEY ?? ''
  if (!partnerId || !partnerKey || !options.redirectUri) throw new Error('shopee_oauth_not_configured')
  const timestamp = Math.floor(Date.now() / 1000)
  const baseUrl = (options.apiBaseUrl ?? process.env.SHOPEE_API_BASE_URL ?? DEFAULT_API_ROOT).replace(/\/api\/v2\/?$/i, '').replace(/\/$/, '')
  const sign = createHmac('sha256', partnerKey).update(`${partnerId}${AUTH_PARTNER_PATH}${timestamp}`).digest('hex')
  const url = new URL(`${baseUrl}${AUTH_PARTNER_PATH}`)
  url.searchParams.set('partner_id', partnerId)
  url.searchParams.set('timestamp', String(timestamp))
  url.searchParams.set('sign', sign)
  url.searchParams.set('redirect', options.redirectUri)
  return url.toString()
}

export async function exchangeShopeeAuthorizationCode (options: { code: string, shopId: string, partnerId?: string, partnerKey?: string, apiBaseUrl?: string }) {
  const partnerId = options.partnerId ?? process.env.SHOPEE_PARTNER_ID ?? ''; const partnerKey = options.partnerKey ?? process.env.SHOPEE_PARTNER_KEY ?? ''
  if (!partnerId || !partnerKey || !/^\d+$/.test(options.shopId) || !options.code) throw new Error('shopee_oauth_not_configured')
  const storage = new EncryptedShopeeTokenStorage(options.shopId, {})
  const sdk = new ShopeeSDK({ partner_id: Number(partnerId), partner_key: partnerKey, shop_id: Number(options.shopId), base_url: normaliseApiBaseUrl(options.apiBaseUrl) }, storage)
  const token = await sdk.authenticateWithCode(options.code, Number(options.shopId))
  if (!token?.access_token || !token.refresh_token) throw new Error('invalid_token_response')
  return { tokens: tokenSetFromSdkToken(token), merchantId: token.merchant_id == null ? null : String(token.merchant_id), shopId: token.shop_id == null ? options.shopId : String(token.shop_id), requestId: stringOrNull(token.request_id) }
}

export function createShopeeOpenApiClient (credentials: Credentials) {
  const config = sdkConfig(credentials)
  const storage = new EncryptedShopeeTokenStorage(credentials.shopId ?? '', { accessToken: credentials.accessToken, refreshToken: credentials.refreshToken, accessTokenExpiresAt: credentials.accessTokenExpiresAt }, async (token) => credentials.onTokensRefreshed?.(tokenSetFromSdkToken(token)))
  const sdk = new ShopeeSDK(config, storage)
  const configured = Number.isSafeInteger(config.partner_id) && config.partner_id > 0 && Boolean(config.partner_key) && Number.isSafeInteger(config.shop_id) && config.shop_id > 0 && Boolean(credentials.accessToken || credentials.refreshToken)

  return {
    configured,
    sdk,
    getTokens: (): TokenSnapshot => {
      const token = storage.snapshot()
      return { accessToken: token?.access_token ?? '', refreshToken: token?.refresh_token ?? '', accessTokenExpiresAt: token?.expired_at ? new Date(token.expired_at).toISOString() : null, requestId: token?.request_id ?? '' }
    },
    async refreshAccessToken () {
      const token = await sdk.refreshToken(Number(credentials.shopId))
      if (!token) throw new Error('invalid_refresh_response')
      return tokenSetFromSdkToken(token)
    },
    async getItemList (options: { offset?: number, pageSize?: number } = {}) {
      if (!configured) throw new Error('not_configured')
      const result = await sdk.product.getItemList({ offset: options.offset ?? 0, page_size: Math.min(options.pageSize ?? 100, 100), item_status: 'NORMAL' })
      const response = asRecord(result.response); const items = Array.isArray(response.item) ? response.item : []
      return { requestId: stringOrNull(result.request_id), items: items.map((item) => String(asRecord(item).item_id)).filter((id) => /^\d+$/.test(id)), hasNextPage: booleanValue(response.has_next_page), nextOffset: numberOrNull(response.next_offset) ?? 0, totalCount: numberOrNull(response.total_count) }
    },
    async getAllItemIds () {
      const items: string[] = []; let offset = 0; let hasNextPage = true; let pages = 0; const visitedOffsets = new Set<number>()
      while (hasNextPage && pages < 1000) {
        if (visitedOffsets.has(offset)) break
        visitedOffsets.add(offset)
        const page = await this.getItemList({ offset, pageSize: 100 }); const before = new Set(items).size
        items.push(...page.items); const uniqueCount = new Set(items).size; const nextOffset = page.nextOffset > offset ? page.nextOffset : offset + page.items.length
        hasNextPage = page.hasNextPage && page.items.length > 0 && uniqueCount > before && (page.totalCount === null || uniqueCount < page.totalCount)
        if (nextOffset <= offset) break
        offset = nextOffset; pages += 1
      }
      return { items: [...new Set(items)], pages }
    },
    async getItemBaseInfo (itemIds: string[]) {
      if (!configured) throw new Error('not_configured')
      const validIds = itemIds.filter((id) => /^\d+$/.test(id)).slice(0, 50)
      if (!validIds.length) return { requestId: null, items: [] as ShopeeItem[] }
      const result = await sdk.product.getItemBaseInfo({ item_id_list: validIds.map(Number) }); const items = Array.isArray(result.response?.item_list) ? result.response.item_list : []
      return { requestId: stringOrNull(result.request_id), items: items.map((raw): ShopeeItem => { const item = asRecord(raw); const price = priceInfo(item.price_info); const image = readProductImage(item); return { itemId: String(item.item_id), itemSku: stringOrNull(item.item_sku), name: stringOrNull(item.item_name), status: stringOrNull(item.item_status), categoryId: item.category_id == null ? null : String(item.category_id), hasModel: booleanValue(item.has_model), condition: stringOrNull(item.condition), price: price.current, originalPrice: price.original, currency: price.currency, stock: readStock(item), attributes: readAttributes(item.attribute_list), imageUrl: image.imageUrl, imageId: image.imageId, createTime: timestampToIso(item.create_time), updateTime: timestampToIso(item.update_time) } }).filter((item) => /^\d+$/.test(item.itemId)) }
    },
    async getModelList (itemId: string): Promise<{ requestId: string | null, models: ShopeeModel[] }> {
      if (!configured) throw new Error('not_configured')
      if (!/^\d+$/.test(itemId)) throw new Error('invalid_item_id')
      const result = await sdk.product.getModelList({ item_id: Number(itemId) }); const response = asRecord(result.response); const models = Array.isArray(response.model) ? response.model : []; const tiers = Array.isArray(response.tier_variation) ? response.tier_variation : []
      return { requestId: stringOrNull(result.request_id), models: models.map((raw): ShopeeModel => { const model = asRecord(raw); const price = priceInfo(model.price_info); const stock = readStock(model); const image = readModelImage(model, tiers); return { itemId, modelId: String(model.model_id), sku: stringOrNull(model.model_sku), currentPrice: price.current, originalPrice: price.original, currency: price.currency, status: stringOrNull(model.model_status), available: model.model_status === 'MODEL_NORMAL' && (stock === null || stock > 0), stock, modelName: readModelName(model, tiers), imageUrl: image.imageUrl, imageId: image.imageId } }).filter((model) => /^\d+$/.test(model.modelId)) }
    },
    async updateDiscountItem (input: { discountId: number, itemList: DiscountItemUpdate[] }, approved: boolean) {
      if (!approved) throw new Error('discount_update_requires_approval')
      return sdk.discount.updateDiscountItem({ discount_id: input.discountId, item_list: input.itemList })
    },
  }
}
