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
} from './amazon-url'

export { detectAmazonPageType, type AmazonPageType } from './page-type-detector'

export { dumpPageHtml, quickText, quickAttr } from './html-dump'

export { toSlug } from './slug'
