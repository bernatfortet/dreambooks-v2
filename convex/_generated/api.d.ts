/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_clearDatabase from "../admin/clearDatabase.js";
import type * as admin_migrateAgeRange from "../admin/migrateAgeRange.js";
import type * as admin_migrateGradeLevel from "../admin/migrateGradeLevel.js";
import type * as admin_missingAuthors from "../admin/missingAuthors.js";
import type * as admin_queries from "../admin/queries.js";
import type * as auth from "../auth.js";
import type * as authors_mutations from "../authors/mutations.js";
import type * as authors_queries from "../authors/queries.js";
import type * as awards_mutations from "../awards/mutations.js";
import type * as awards_queries from "../awards/queries.js";
import type * as bookAuthors_mutations from "../bookAuthors/mutations.js";
import type * as bookAuthors_queries from "../bookAuthors/queries.js";
import type * as bookCoverCandidates_mutations from "../bookCoverCandidates/mutations.js";
import type * as bookCoverCandidates_queries from "../bookCoverCandidates/queries.js";
import type * as bookEditions_mutations from "../bookEditions/mutations.js";
import type * as bookEditions_queries from "../bookEditions/queries.js";
import type * as bookIdentifiers_mutations from "../bookIdentifiers/mutations.js";
import type * as bookIdentifiers_queries from "../bookIdentifiers/queries.js";
import type * as books_internal from "../books/internal.js";
import type * as books_lib_searchText from "../books/lib/searchText.js";
import type * as books_migrateDuplicates from "../books/migrateDuplicates.js";
import type * as books_mutations from "../books/mutations.js";
import type * as books_queries from "../books/queries.js";
import type * as crons from "../crons.js";
import type * as debug_queries from "../debug/queries.js";
import type * as http from "../http.js";
import type * as lib_authTokenProfile from "../lib/authTokenProfile.js";
import type * as lib_badScrape from "../lib/badScrape.js";
import type * as lib_bookCoverUrls from "../lib/bookCoverUrls.js";
import type * as lib_deleteHelpers from "../lib/deleteHelpers.js";
import type * as lib_identifiers from "../lib/identifiers.js";
import type * as lib_scrapeVersions from "../lib/scrapeVersions.js";
import type * as lib_scraping_config from "../lib/scraping/config.js";
import type * as lib_scraping_domains_book_types from "../lib/scraping/domains/book/types.js";
import type * as lib_scraping_providers_firecrawl_client from "../lib/scraping/providers/firecrawl/client.js";
import type * as lib_scraping_types from "../lib/scraping/types.js";
import type * as lib_scraping_utils_amazonUrl from "../lib/scraping/utils/amazonUrl.js";
import type * as lib_slug from "../lib/slug.js";
import type * as lib_superadmin from "../lib/superadmin.js";
import type * as lib_utils_ageRange from "../lib/utils/ageRange.js";
import type * as lib_utils_gradeLevel from "../lib/utils/gradeLevel.js";
import type * as migrations_backfillDetailsStatus from "../migrations/backfillDetailsStatus.js";
import type * as migrations_backfillQueueSource from "../migrations/backfillQueueSource.js";
import type * as publishers_mutations from "../publishers/mutations.js";
import type * as publishers_queries from "../publishers/queries.js";
import type * as scrapeQueue_mutations from "../scrapeQueue/mutations.js";
import type * as scrapeQueue_queries from "../scrapeQueue/queries.js";
import type * as scraping_adapters_amazon_book from "../scraping/adapters/amazon/book.js";
import type * as scraping_adapters_amazon_image from "../scraping/adapters/amazon/image.js";
import type * as scraping_adapters_amazon_series from "../scraping/adapters/amazon/series.js";
import type * as scraping_adapters_amazon_url from "../scraping/adapters/amazon/url.js";
import type * as scraping_artifacts from "../scraping/artifacts.js";
import type * as scraping_backfillAuthorImages from "../scraping/backfillAuthorImages.js";
import type * as scraping_backfillSeriesCovers from "../scraping/backfillSeriesCovers.js";
import type * as scraping_crawlBook from "../scraping/crawlBook.js";
import type * as scraping_downloadAuthorImage from "../scraping/downloadAuthorImage.js";
import type * as scraping_downloadAwardImage from "../scraping/downloadAwardImage.js";
import type * as scraping_downloadCover from "../scraping/downloadCover.js";
import type * as scraping_downloadSeriesCover from "../scraping/downloadSeriesCover.js";
import type * as scraping_enrichBook from "../scraping/enrichBook.js";
import type * as scraping_importAuthor from "../scraping/importAuthor.js";
import type * as scraping_importBook from "../scraping/importBook.js";
import type * as scraping_refreshCover from "../scraping/refreshCover.js";
import type * as scraping_scrapeRuns from "../scraping/scrapeRuns.js";
import type * as scraping_scrapeSeries from "../scraping/scrapeSeries.js";
import type * as search_queries from "../search/queries.js";
import type * as series_mutations from "../series/mutations.js";
import type * as series_queries from "../series/queries.js";
import type * as users_queries from "../users/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/clearDatabase": typeof admin_clearDatabase;
  "admin/migrateAgeRange": typeof admin_migrateAgeRange;
  "admin/migrateGradeLevel": typeof admin_migrateGradeLevel;
  "admin/missingAuthors": typeof admin_missingAuthors;
  "admin/queries": typeof admin_queries;
  auth: typeof auth;
  "authors/mutations": typeof authors_mutations;
  "authors/queries": typeof authors_queries;
  "awards/mutations": typeof awards_mutations;
  "awards/queries": typeof awards_queries;
  "bookAuthors/mutations": typeof bookAuthors_mutations;
  "bookAuthors/queries": typeof bookAuthors_queries;
  "bookCoverCandidates/mutations": typeof bookCoverCandidates_mutations;
  "bookCoverCandidates/queries": typeof bookCoverCandidates_queries;
  "bookEditions/mutations": typeof bookEditions_mutations;
  "bookEditions/queries": typeof bookEditions_queries;
  "bookIdentifiers/mutations": typeof bookIdentifiers_mutations;
  "bookIdentifiers/queries": typeof bookIdentifiers_queries;
  "books/internal": typeof books_internal;
  "books/lib/searchText": typeof books_lib_searchText;
  "books/migrateDuplicates": typeof books_migrateDuplicates;
  "books/mutations": typeof books_mutations;
  "books/queries": typeof books_queries;
  crons: typeof crons;
  "debug/queries": typeof debug_queries;
  http: typeof http;
  "lib/authTokenProfile": typeof lib_authTokenProfile;
  "lib/badScrape": typeof lib_badScrape;
  "lib/bookCoverUrls": typeof lib_bookCoverUrls;
  "lib/deleteHelpers": typeof lib_deleteHelpers;
  "lib/identifiers": typeof lib_identifiers;
  "lib/scrapeVersions": typeof lib_scrapeVersions;
  "lib/scraping/config": typeof lib_scraping_config;
  "lib/scraping/domains/book/types": typeof lib_scraping_domains_book_types;
  "lib/scraping/providers/firecrawl/client": typeof lib_scraping_providers_firecrawl_client;
  "lib/scraping/types": typeof lib_scraping_types;
  "lib/scraping/utils/amazonUrl": typeof lib_scraping_utils_amazonUrl;
  "lib/slug": typeof lib_slug;
  "lib/superadmin": typeof lib_superadmin;
  "lib/utils/ageRange": typeof lib_utils_ageRange;
  "lib/utils/gradeLevel": typeof lib_utils_gradeLevel;
  "migrations/backfillDetailsStatus": typeof migrations_backfillDetailsStatus;
  "migrations/backfillQueueSource": typeof migrations_backfillQueueSource;
  "publishers/mutations": typeof publishers_mutations;
  "publishers/queries": typeof publishers_queries;
  "scrapeQueue/mutations": typeof scrapeQueue_mutations;
  "scrapeQueue/queries": typeof scrapeQueue_queries;
  "scraping/adapters/amazon/book": typeof scraping_adapters_amazon_book;
  "scraping/adapters/amazon/image": typeof scraping_adapters_amazon_image;
  "scraping/adapters/amazon/series": typeof scraping_adapters_amazon_series;
  "scraping/adapters/amazon/url": typeof scraping_adapters_amazon_url;
  "scraping/artifacts": typeof scraping_artifacts;
  "scraping/backfillAuthorImages": typeof scraping_backfillAuthorImages;
  "scraping/backfillSeriesCovers": typeof scraping_backfillSeriesCovers;
  "scraping/crawlBook": typeof scraping_crawlBook;
  "scraping/downloadAuthorImage": typeof scraping_downloadAuthorImage;
  "scraping/downloadAwardImage": typeof scraping_downloadAwardImage;
  "scraping/downloadCover": typeof scraping_downloadCover;
  "scraping/downloadSeriesCover": typeof scraping_downloadSeriesCover;
  "scraping/enrichBook": typeof scraping_enrichBook;
  "scraping/importAuthor": typeof scraping_importAuthor;
  "scraping/importBook": typeof scraping_importBook;
  "scraping/refreshCover": typeof scraping_refreshCover;
  "scraping/scrapeRuns": typeof scraping_scrapeRuns;
  "scraping/scrapeSeries": typeof scraping_scrapeSeries;
  "search/queries": typeof search_queries;
  "series/mutations": typeof series_mutations;
  "series/queries": typeof series_queries;
  "users/queries": typeof users_queries;
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
