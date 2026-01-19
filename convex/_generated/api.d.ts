/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as authors_mutations from "../authors/mutations.js";
import type * as authors_queries from "../authors/queries.js";
import type * as bookAuthors_mutations from "../bookAuthors/mutations.js";
import type * as bookAuthors_queries from "../bookAuthors/queries.js";
import type * as books_internal from "../books/internal.js";
import type * as books_mutations from "../books/mutations.js";
import type * as books_queries from "../books/queries.js";
import type * as crons from "../crons.js";
import type * as migrations_backfillDetailsStatus from "../migrations/backfillDetailsStatus.js";
import type * as migrations_backfillQueueSource from "../migrations/backfillQueueSource.js";
import type * as scrapeQueue_mutations from "../scrapeQueue/mutations.js";
import type * as scrapeQueue_queries from "../scrapeQueue/queries.js";
import type * as scraping_adapters_amazon_book from "../scraping/adapters/amazon/book.js";
import type * as scraping_adapters_amazon_image from "../scraping/adapters/amazon/image.js";
import type * as scraping_adapters_amazon_series from "../scraping/adapters/amazon/series.js";
import type * as scraping_adapters_amazon_url from "../scraping/adapters/amazon/url.js";
import type * as scraping_crawlBook from "../scraping/crawlBook.js";
import type * as scraping_downloadCover from "../scraping/downloadCover.js";
import type * as scraping_enrichBook from "../scraping/enrichBook.js";
import type * as scraping_importAuthor from "../scraping/importAuthor.js";
import type * as scraping_importBook from "../scraping/importBook.js";
import type * as scraping_refreshCover from "../scraping/refreshCover.js";
import type * as scraping_scrapeRuns from "../scraping/scrapeRuns.js";
import type * as scraping_scrapeSeries from "../scraping/scrapeSeries.js";
import type * as series_mutations from "../series/mutations.js";
import type * as series_queries from "../series/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "authors/mutations": typeof authors_mutations;
  "authors/queries": typeof authors_queries;
  "bookAuthors/mutations": typeof bookAuthors_mutations;
  "bookAuthors/queries": typeof bookAuthors_queries;
  "books/internal": typeof books_internal;
  "books/mutations": typeof books_mutations;
  "books/queries": typeof books_queries;
  crons: typeof crons;
  "migrations/backfillDetailsStatus": typeof migrations_backfillDetailsStatus;
  "migrations/backfillQueueSource": typeof migrations_backfillQueueSource;
  "scrapeQueue/mutations": typeof scrapeQueue_mutations;
  "scrapeQueue/queries": typeof scrapeQueue_queries;
  "scraping/adapters/amazon/book": typeof scraping_adapters_amazon_book;
  "scraping/adapters/amazon/image": typeof scraping_adapters_amazon_image;
  "scraping/adapters/amazon/series": typeof scraping_adapters_amazon_series;
  "scraping/adapters/amazon/url": typeof scraping_adapters_amazon_url;
  "scraping/crawlBook": typeof scraping_crawlBook;
  "scraping/downloadCover": typeof scraping_downloadCover;
  "scraping/enrichBook": typeof scraping_enrichBook;
  "scraping/importAuthor": typeof scraping_importAuthor;
  "scraping/importBook": typeof scraping_importBook;
  "scraping/refreshCover": typeof scraping_refreshCover;
  "scraping/scrapeRuns": typeof scraping_scrapeRuns;
  "scraping/scrapeSeries": typeof scraping_scrapeSeries;
  "series/mutations": typeof series_mutations;
  "series/queries": typeof series_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
