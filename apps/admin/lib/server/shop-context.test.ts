import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ isPortalSessionValid: vi.fn(), getConnection: vi.fn() }))

vi.mock('./shop-auth', () => ({ isPortalSessionValid: mocks.isPortalSessionValid }))
vi.mock('./shop-portal', () => ({ getConnection: mocks.getConnection }))

import { requireShopContext } from './shop-context'

const connection = {
  id: 'connection-1', shop_id: 'shop-1', name: 'Shop 1', status: 'connected',
  last_catalog_sync_at: null, last_error: null, created_at: '2026-01-01', updated_at: '2026-01-01'
}

function portalRequest (url: string) {
  return new Request(url, { headers: { cookie: 'alpha_shop_portal_session=portal-token' } })
}

describe('requireShopContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://supabase.example'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.getConnection.mockResolvedValue(connection)
    mocks.isPortalSessionValid.mockResolvedValue(true)
  })

  it('does not let a valid portal session bypass a missing membership', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })))

    await expect(requireShopContext(portalRequest('https://admin.example/api/catalog-health?connection_id=connection-1'), 'sync'))
      .rejects.toThrow('shop_forbidden')
  })

  it('enforces the required role for the connection', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role: 'viewer' }]), { status: 200 })))

    await expect(requireShopContext(portalRequest('https://admin.example/api/catalog-health?connection_id=connection-1'), 'sync'))
      .rejects.toThrow('shop_forbidden')
  })

  it('returns the membership role when it satisfies the requirement', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role: 'sync' }]), { status: 200 })))

    await expect(requireShopContext(portalRequest('https://admin.example/api/catalog-health?connection_id=connection-1'), 'sync'))
      .resolves.toMatchObject({ connectionId: 'connection-1', shopeeShopId: 'shop-1', role: 'sync' })
  })

  it('can authorize a path connection id without trusting a query id', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role: 'viewer' }]), { status: 200 })))

    await expect(requireShopContext(portalRequest('https://admin.example/api/shop-connections/connection-1/catalog?connection_id=other'), 'viewer', 'connection-1'))
      .resolves.toMatchObject({ connectionId: 'connection-1' })
    expect(mocks.getConnection).toHaveBeenCalledWith('connection-1')
  })
})
