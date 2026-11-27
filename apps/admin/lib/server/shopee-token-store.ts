import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { ShopeeTokenSet } from './shopee-open-api'
import { supabaseHeaders } from './supabase-http'

type StoredToken = { access_token_ciphertext: string, refresh_token_ciphertext: string, access_token_expires_at: string | null }

function keyFromEnv () {
  const raw = process.env.SHOPEE_TOKEN_ENCRYPTION_KEY ?? ''
  if (!raw) return null
  const hex = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  return hex.length === 32 ? hex : null
}

function encrypt (value: string, key: Buffer) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.')
}

function decrypt (value: string, key: Buffer) {
  const [iv, authTag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

function supabaseConfig () {
  const baseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ''
  const key = keyFromEnv()
  return baseUrl && serviceKey && key ? { baseUrl, serviceKey, key } : null
}

export function tokenStoreStatus () {
  return supabaseConfig() ? 'encrypted_supabase' : 'env_bootstrap_only'
}

export async function readStoredShopeeTokens (shopId: string) {
  const config = supabaseConfig(); if (!config) return null
  const url = `${config.baseUrl}/rest/v1/shopee_token_credentials?shop_id=eq.${encodeURIComponent(shopId)}&select=access_token_ciphertext,refresh_token_ciphertext,access_token_expires_at&limit=1`
  const response = await fetch(url, { headers: supabaseHeaders(config.serviceKey), cache: 'no-store' })
  if (!response.ok) throw new Error(`token_store_read_failed:${response.status}`)
  const rows = await response.json() as StoredToken[]
  const row = rows[0]; if (!row) return null
  return { accessToken: decrypt(row.access_token_ciphertext, config.key), refreshToken: decrypt(row.refresh_token_ciphertext, config.key), accessTokenExpiresAt: row.access_token_expires_at }
}

export async function persistShopeeTokens (shopId: string, tokens: ShopeeTokenSet) {
  const config = supabaseConfig(); if (!config) throw new Error('token_store_not_configured')
  const url = `${config.baseUrl}/rest/v1/shopee_token_credentials?on_conflict=shop_id`
  const response = await fetch(url, {
    method: 'POST', headers: supabaseHeaders(config.serviceKey, { 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ shop_id: shopId, access_token_ciphertext: encrypt(tokens.accessToken, config.key), refresh_token_ciphertext: encrypt(tokens.refreshToken, config.key), access_token_expires_at: tokens.accessTokenExpiresAt, updated_at: new Date().toISOString() })
  })
  if (!response.ok) throw new Error(`token_store_write_failed:${response.status}`)
}

export function tokenFingerprint (token: string | null | undefined) {
  return token ? createHash('sha256').update(token).digest('hex').slice(0, 12) : null
}
