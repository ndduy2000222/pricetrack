const { createShopeeOpenApiClient, credentialsFromEnv } = require('./shopee-open-api-client')

const createShopeeSellerAdapter = ({ credentials, client } = {}) => {
  const resolvedClient = client || (credentials ? createShopeeOpenApiClient({ credentials }) : null)
  const configured = Boolean(credentials && credentials.partnerId && credentials.accessToken && resolvedClient && resolvedClient.status !== 'not_configured')

  return {
    name: 'shopee-seller',
    status: configured ? 'read_only' : 'not_configured',
    async readCurrent(model) {
      if (!configured) return { status: 'not_configured', modelId: model.id }
      return resolvedClient.readCurrent(model)
    },
    async writePromotion() {
      if (!configured) return { status: 'not_configured' }
      return { status: 'write_disabled_until_validated' }
    },
    async readBack(model) {
      if (!configured) return { status: 'not_configured', modelId: model.id }
      return resolvedClient.readBack(model)
    }
  }
}

const createShopeeSellerAdapterFromEnv = ({ env = process.env, fetchImpl } = {}) => {
  const credentials = credentialsFromEnv(env)
  const client = createShopeeOpenApiClient({ credentials, fetchImpl })
  return createShopeeSellerAdapter({ credentials, client })
}

module.exports = { createShopeeSellerAdapter, createShopeeSellerAdapterFromEnv }
