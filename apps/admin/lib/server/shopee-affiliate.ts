import { createHmac } from 'node:crypto'

const endpoint = 'https://open-api.affiliate.shopee.vn/graphql'

export type AffiliateProductOffer = {
  itemId: string
  productName: string
  priceMin: number | null
  priceMax: number | null
  imageUrl: string | null
  shopId: string | null
  shopName: string | null
  productLink: string | null
  shopType: number[]
}
type AffiliateResponse = {
  data?: { productOfferV2?: { nodes?: unknown[], pageInfo?: { hasNextPage?: boolean } } }
  errors?: Array<{ message?: string }>
}
const query = `query ProductOffers($keyword: String, $page: Int, $limit: Int) {
  productOfferV2(keyword: $keyword, sortType: 1, page: $page, limit: $limit) {
    nodes {
      itemId
      productName
      priceMin
      priceMax
      imageUrl
      shopId
      shopName
      productLink
      shopType
    }
    pageInfo { hasNextPage }
  }
}`

const numberOrNull = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}
const textOrNull = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null

export function affiliateConfigured (env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.SHOPEE_AFFILIATE_APP_ID?.trim() && env.SHOPEE_AFFILIATE_SECRET?.trim())
}

function parseOffer (value: unknown): AffiliateProductOffer | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const itemId = textOrNull(row.itemId)
  const productName = textOrNull(row.productName)
  if (!itemId || !productName) return null
  const shopType = Array.isArray(row.shopType) ? row.shopType.map(Number).filter(Number.isFinite) : []
  return {
    itemId,
    productName,
    priceMin: numberOrNull(row.priceMin),
    priceMax: numberOrNull(row.priceMax),
    imageUrl: textOrNull(row.imageUrl),
    shopId: textOrNull(row.shopId),
    shopName: textOrNull(row.shopName),
    productLink: textOrNull(row.productLink),
    shopType
  }
}

export async function searchAffiliateProducts (keyword: string, options: { fetchImpl?: typeof fetch, limit?: number } = {}) {
  if (!affiliateConfigured()) throw new Error('affiliate_credentials_not_configured')
  const fetchImpl = options.fetchImpl ?? fetch
  const appId = process.env.SHOPEE_AFFILIATE_APP_ID!.trim()
  const secret = process.env.SHOPEE_AFFILIATE_SECRET!.trim()
  const variables = { keyword, page: 1, limit: Math.min(Math.max(options.limit ?? 50, 1), 50) }
  const body = JSON.stringify({ query, variables })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', secret).update(`${appId}${timestamp}${body}`).digest('hex')
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`
    },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000)
  })
  if (!response.ok) throw new Error(`affiliate_http_${response.status}`)
  const payload = await response.json() as AffiliateResponse
  if (payload.errors?.length) throw new Error('affiliate_graphql_error')
  return (payload.data?.productOfferV2?.nodes ?? []).map(parseOffer).filter((row): row is AffiliateProductOffer => Boolean(row))
}

