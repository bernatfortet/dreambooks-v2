'use node'

export function requireScrapeImportKey(apiKey: string) {
  const expectedKey = process.env.SCRAPE_IMPORT_KEY
  if (!expectedKey) {
    throw new Error('SCRAPE_IMPORT_KEY environment variable is not configured')
  }

  if (apiKey !== expectedKey) {
    throw new Error('Invalid API key')
  }
}
