const createFixtureCompetitorSource = (observationsByModel = {}) => ({
  name: 'fixture',
  status: 'mock',
  async collect(model) {
    return observationsByModel[model.id] || []
  }
})

const createNotConfiguredCompetitorSource = () => ({
  name: 'not-configured',
  status: 'not_configured',
  async collect() {
    return []
  }
})

module.exports = {
  createFixtureCompetitorSource,
  createNotConfiguredCompetitorSource
}
