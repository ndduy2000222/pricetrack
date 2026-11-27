import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStoredCatalog } from './stored-catalog'

describe('readStoredCatalog', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns an empty stored catalog instead of null when no rows exist', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'connection-1', shop_id: 'shop-1' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 })))

    await expect(readStoredCatalog('connection-1')).resolves.toEqual({
      connectionId: 'connection-1',
      shopId: 'shop-1',
      rows: [],
      observedAt: null
    })
  })

  it('does not swallow stored read errors into a live-sync signal', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'connection-1', shop_id: 'shop-1' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response('database unavailable', { status: 503 })))

    await expect(readStoredCatalog('connection-1')).rejects.toThrow('supabase_http_503')
  })
})
