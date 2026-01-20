/**
 * Amazon URL normalization and ID extraction utilities.
 *
 * Re-exports from convex/lib/scraping/utils/amazonUrl.ts for backward compatibility.
 * Convex functions can import from here or directly from the shared module.
 */

export {
  extractAsin,
  extractAsinFromUrl,
  extractAuthorId,
  extractSeriesId,
  extractAmazonSlug,
  normalizeAmazonUrl,
  buildAuthorUrl,
  buildBookUrl,
  isAmazonUrl,
} from '../../../../lib/scraping/utils/amazon-url'
