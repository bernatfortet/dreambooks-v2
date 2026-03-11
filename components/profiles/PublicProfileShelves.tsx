'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePaginatedQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import { api } from '@/convex/_generated/api'
import { PaginatedBookMasonrySection } from '@/components/books/masonry/PaginatedBookMasonrySection'
import { PaginatedCollectionSection } from '@/components/collections/PaginatedCollectionSection'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const PAGE_SIZE = 24
const PUBLIC_SHELF_TABS = ['books-read', 'books-liked', 'series-read', 'series-liked', 'authors-liked'] as const
const PUBLIC_SHELF_TAB_CONTENTS = [
  {
    value: 'books-read',
    render: renderBooksReadTab,
  },
  {
    value: 'books-liked',
    render: renderBooksLikedTab,
  },
  {
    value: 'series-read',
    render: renderSeriesReadTab,
  },
  {
    value: 'series-liked',
    render: renderSeriesLikedTab,
  },
  {
    value: 'authors-liked',
    render: renderAuthorsLikedTab,
  },
] as const

type PublicProfileData = NonNullable<FunctionReturnType<typeof api.profiles.queries.getPublicBySlug>>
type PublicProfileCounts = PublicProfileData['counts']

type PublicSeriesShelfItem = FunctionReturnType<typeof api.profiles.queries.listPublicSeriesShelf>['page'][number]
type PublicAuthorShelfItem = FunctionReturnType<typeof api.profiles.queries.listPublicAuthorShelf>['page'][number]

export function PublicProfileShelves({
  counts,
  profileId,
  profileName,
}: {
  counts: PublicProfileCounts
  profileId: Id<'profiles'>
  profileName: string
}) {
  const defaultTab = PUBLIC_SHELF_TABS.find((tab) => getShelfCount(counts, tab) > 0) ?? PUBLIC_SHELF_TABS[0]

  return (
    <Tabs defaultValue={defaultTab} className='gap-6'>
      <TabsList className='h-auto flex-wrap justify-start'>
        {PUBLIC_SHELF_TABS.map((shelfTab) => (
          <TabsTrigger key={shelfTab} value={shelfTab}>
            {getShelfLabel(shelfTab)} ({getShelfCount(counts, shelfTab)})
          </TabsTrigger>
        ))}
      </TabsList>

      {PUBLIC_SHELF_TAB_CONTENTS.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.render({ profileId, profileName })}
        </TabsContent>
      ))}
    </Tabs>
  )
}

function PublicBookShelfPanel({
  emptyMessage,
  profileId,
  shelfType,
}: {
  emptyMessage: string
  profileId: Id<'profiles'>
  shelfType: 'liked' | 'read'
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.profiles.queries.listPublicShelf,
    {
      profileId,
      shelfType,
    },
    { initialNumItems: PAGE_SIZE },
  )

  return (
    <PaginatedBookMasonrySection
      emptyMessage={emptyMessage}
      items={results}
      loadMore={loadMore}
      status={status}
    />
  )
}

function PublicSeriesShelfPanel({
  emptyMessage,
  profileId,
  shelfType,
}: {
  emptyMessage: string
  profileId: Id<'profiles'>
  shelfType: 'liked' | 'read'
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.profiles.queries.listPublicSeriesShelf,
    {
      profileId,
      shelfType,
    },
    { initialNumItems: PAGE_SIZE },
  )

  return (
    <PaginatedCollectionSection
      emptyState={<p className='py-12 text-center text-muted-foreground'>{emptyMessage}</p>}
      items={results}
      loadMore={loadMore}
      loadingFallback={<PublicSeriesShelfSkeleton />}
      manualLoadLabel='Load more series'
      pageSize={PAGE_SIZE}
      renderItems={renderPublicSeriesShelfItems}
      status={status}
    />
  )
}

function PublicAuthorShelfPanel({
  emptyMessage,
  profileId,
}: {
  emptyMessage: string
  profileId: Id<'profiles'>
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.profiles.queries.listPublicAuthorShelf,
    {
      profileId,
    },
    { initialNumItems: PAGE_SIZE },
  )

  return (
    <PaginatedCollectionSection
      emptyState={<p className='py-12 text-center text-muted-foreground'>{emptyMessage}</p>}
      items={results}
      loadMore={loadMore}
      loadingFallback={<PublicAuthorShelfSkeleton />}
      manualLoadLabel='Load more authors'
      pageSize={PAGE_SIZE}
      renderItems={renderPublicAuthorShelfItems}
      status={status}
    />
  )
}

function renderBooksReadTab(args: {
  profileId: Id<'profiles'>
  profileName: string
}) {
  return (
    <PublicBookShelfPanel
      emptyMessage={`${args.profileName} hasn't marked any books as read yet.`}
      profileId={args.profileId}
      shelfType='read'
    />
  )
}

function renderBooksLikedTab(args: {
  profileId: Id<'profiles'>
  profileName: string
}) {
  return (
    <PublicBookShelfPanel
      emptyMessage={`${args.profileName} hasn't liked any books yet.`}
      profileId={args.profileId}
      shelfType='liked'
    />
  )
}

function renderSeriesReadTab(args: {
  profileId: Id<'profiles'>
  profileName: string
}) {
  return (
    <PublicSeriesShelfPanel
      emptyMessage={`${args.profileName} hasn't marked any series as read yet.`}
      profileId={args.profileId}
      shelfType='read'
    />
  )
}

function renderSeriesLikedTab(args: {
  profileId: Id<'profiles'>
  profileName: string
}) {
  return (
    <PublicSeriesShelfPanel
      emptyMessage={`${args.profileName} hasn't liked any series yet.`}
      profileId={args.profileId}
      shelfType='liked'
    />
  )
}

function renderAuthorsLikedTab(args: {
  profileId: Id<'profiles'>
  profileName: string
}) {
  return (
    <PublicAuthorShelfPanel
      emptyMessage={`${args.profileName} hasn't liked any authors yet.`}
      profileId={args.profileId}
    />
  )
}

function renderPublicSeriesShelfItems(items: PublicSeriesShelfItem[]) {
  return (
    <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'>
      {items.map((item) => (
        <Link key={item._id} href={`/series/${item.slug ?? item._id}`} className='group block'>
          <div className='relative mb-2 aspect-32/25 overflow-hidden rounded-lg bg-muted'>
            {item.coverUrl ? (
              <Image
                src={item.coverUrl}
                alt={item.name}
                fill
                className='object-cover transition-transform duration-200 group-hover:scale-105'
                sizes='(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw'
              />
            ) : (
              <div className='flex h-full w-full items-center justify-center p-4 text-center text-sm text-muted-foreground'>
                {item.name}
              </div>
            )}
          </div>

          <h3 className='line-clamp-2 text-sm font-medium transition-colors group-hover:text-primary'>{item.name}</h3>
        </Link>
      ))}
    </div>
  )
}

function renderPublicAuthorShelfItems(items: PublicAuthorShelfItem[]) {
  return (
    <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'>
      {items.map((item) => (
        <Link key={item._id} href={`/authors/${item.slug ?? item._id}`} className='group block text-center'>
          <div className='relative mx-auto h-24 w-24 overflow-hidden rounded-full bg-muted'>
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                className='object-cover transition-transform duration-200 group-hover:scale-105'
                sizes='96px'
              />
            ) : (
              <div className='flex h-full w-full items-center justify-center text-2xl font-medium text-muted-foreground'>
                {item.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <p className='mt-3 line-clamp-2 text-sm font-medium transition-colors group-hover:text-primary'>{item.name}</p>
        </Link>
      ))}
    </div>
  )
}

function PublicSeriesShelfSkeleton() {
  return (
    <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'>
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className='space-y-2'>
          <div className='aspect-32/25 animate-pulse rounded-lg bg-muted' />
          <div className='h-4 w-3/4 animate-pulse rounded bg-muted' />
        </div>
      ))}
    </div>
  )
}

function PublicAuthorShelfSkeleton() {
  return (
    <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'>
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className='space-y-3 text-center'>
          <div className='mx-auto h-24 w-24 animate-pulse rounded-full bg-muted' />
          <div className='mx-auto h-4 w-3/4 animate-pulse rounded bg-muted' />
        </div>
      ))}
    </div>
  )
}

function getShelfLabel(shelfTab: (typeof PUBLIC_SHELF_TABS)[number]) {
  switch (shelfTab) {
    case 'books-read':
      return 'Read Books'
    case 'books-liked':
      return 'Liked Books'
    case 'series-read':
      return 'Read Series'
    case 'series-liked':
      return 'Liked Series'
    case 'authors-liked':
      return 'Liked Authors'
  }
}

function getShelfCount(
  counts: PublicProfileCounts,
  shelfTab: (typeof PUBLIC_SHELF_TABS)[number],
) {
  switch (shelfTab) {
    case 'books-read':
      return counts.books.read
    case 'books-liked':
      return counts.books.liked
    case 'series-read':
      return counts.series.read
    case 'series-liked':
      return counts.series.liked
    case 'authors-liked':
      return counts.authors.liked
  }
}
