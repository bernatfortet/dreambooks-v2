'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import Link from 'next/link'
import { BookGridList, BookGridSkeleton } from '@/components/books/BookGrid'
import { SeriesGridItem } from '@/components/series/SeriesGrid'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageContainer } from '@/components/ui/PageContainer'

type SearchResults = NonNullable<FunctionReturnType<typeof api.search.queries.global>>
type SearchSeries = SearchResults['series'][number]
type SearchAuthor = SearchResults['authors'][number]

export default function SearchPage() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [activeTab, setActiveTab] = useState<'all' | 'books' | 'series' | 'authors'>('all')
  const results = useQuery(api.search.queries.global, {
    query,
    limitPerType: 50,
  })

  if (!query) {
    return (
      <PageContainer>
        <h1 className='text-3xl font-bold mb-6'>Search</h1>
        <p className='text-muted-foreground'>Enter a search query to find books, series, and authors.</p>
      </PageContainer>
    )
  }

  if (results === undefined) {
    return (
      <PageContainer>
        <div className='flex items-center justify-between mb-6 flex-wrap gap-4'>
          <h1 className='text-3xl font-bold'>Search results for &quot;{query}&quot;</h1>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value='all'>All (0)</TabsTrigger>
              <TabsTrigger value='series'>Series (0)</TabsTrigger>
              <TabsTrigger value='books'>Books (0)</TabsTrigger>
              <TabsTrigger value='authors'>Authors (0)</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <SearchResultsSkeleton />
      </PageContainer>
    )
  }

  const totalCount = results.books.length + results.series.length + results.authors.length
  const hasResults = totalCount > 0

  const showSeries = activeTab === 'all' || activeTab === 'series'
  const showBooks = activeTab === 'all' || activeTab === 'books'
  const showAuthors = activeTab === 'all' || activeTab === 'authors'

  return (
    <PageContainer>
      <div className='flex items-center  mb-6 flex-wrap gap-8'>
        <h1 className='text-3xl font-bold'>Search results for &quot;{query}&quot;</h1>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value='all'>All ({totalCount})</TabsTrigger>
            <TabsTrigger value='series'>Series ({results.series.length})</TabsTrigger>
            <TabsTrigger value='books'>Books ({results.books.length})</TabsTrigger>
            <TabsTrigger value='authors'>Authors ({results.authors.length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {!hasResults ? (
        <p className='text-center text-muted-foreground py-12'>No results found.</p>
      ) : (
        <div className='space-y-12'>
          {showSeries && results.series.length > 0 && (
            <section>
              <h2 className='text-2xl font-semibold mb-4'>Series ({results.series.length})</h2>
              <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'>
                {results.series.map((series: SearchSeries) => (
                  <SeriesGridItem key={series._id} slug={series.slug ?? series._id} name={series.name} coverUrl={series.coverUrl} />
                ))}
              </div>
            </section>
          )}

          {showBooks && results.books.length > 0 && (
            <section>
              <h2 className='text-2xl font-semibold mb-4'>Books ({results.books.length})</h2>
              <BookGridList books={results.books} />
            </section>
          )}

          {showAuthors && results.authors.length > 0 && (
            <section>
              <h2 className='text-2xl font-semibold mb-4'>Authors ({results.authors.length})</h2>
              <div className='space-y-4'>
                {results.authors.map((author: SearchAuthor) => (
                  <AuthorCard key={author._id} slug={author.slug ?? author._id} name={author.name} />
                ))}
              </div>
            </section>
          )}

          {activeTab !== 'all' && !showSeries && !showBooks && !showAuthors && (
            <p className='text-center text-muted-foreground py-12'>No {activeTab} found.</p>
          )}
        </div>
      )}
    </PageContainer>
  )
}

type AuthorCardProps = {
  slug: string
  name: string
}

function AuthorCard({ slug, name }: AuthorCardProps) {
  return (
    <Link href={`/authors/${slug}`} className='block'>
      <div className='flex items-center gap-4 p-4 rounded-lg hover:bg-accent transition-colors'>
        <div className='w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium shrink-0'>
          {name.charAt(0).toUpperCase()}
        </div>
        <h3 className='text-lg font-medium'>{name}</h3>
      </div>
    </Link>
  )
}

function SearchResultsSkeleton() {
  return (
    <div className='space-y-12'>
      <section>
        <div className='h-8 bg-muted rounded animate-pulse w-48 mb-4' />
        <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className='space-y-2'>
              <div className='aspect-32/25 bg-muted rounded-lg animate-pulse' />
              <div className='h-4 bg-muted rounded animate-pulse w-3/4' />
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className='h-8 bg-muted rounded animate-pulse w-48 mb-4' />
        <BookGridSkeleton />
      </section>
      <section>
        <div className='h-8 bg-muted rounded animate-pulse w-48 mb-4' />
        <div className='space-y-4'>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className='flex items-center gap-4 p-4'>
              <div className='w-12 h-12 rounded-full bg-muted animate-pulse shrink-0' />
              <div className='h-6 bg-muted rounded animate-pulse w-48' />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
