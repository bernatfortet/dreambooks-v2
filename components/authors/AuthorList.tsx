'use client'

import { usePaginatedQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { PaginatedCollectionSection } from '@/components/collections/PaginatedCollectionSection'
import Image from 'next/image'
import Link from 'next/link'

const DEFAULT_BOOK_COVER_ASPECT_RATIO = 2 / 3
const AUTHORS_PAGE_SIZE = 10

type AuthorListData = NonNullable<FunctionReturnType<typeof api.authors.queries.listWithTopBooksPaginated>>
type AuthorListItem = AuthorListData['page'][number]
type AuthorBook = AuthorItemProps['books'][number]

export function AuthorList() {
  const { results, status, loadMore } = usePaginatedQuery(api.authors.queries.listWithTopBooksPaginated, {}, {
    initialNumItems: AUTHORS_PAGE_SIZE,
  })

  return (
    <PaginatedCollectionSection
      emptyState={<p className='text-center text-muted-foreground py-12'>No authors yet.</p>}
      items={results}
      loadMore={loadMore}
      loadingFallback={<AuthorListSkeleton />}
      manualLoadLabel='Load more authors'
      pageSize={AUTHORS_PAGE_SIZE}
      renderItems={renderAuthorItems}
      rootMargin='500px 0px'
      status={status}
    />
  )
}

type AuthorItemProps = {
  slug: string
  name: string
  imageUrl: string | null
  books: Array<{
    _id: string
    slug?: string | null
    title: string
    coverUrl: string | null
    coverWidth: number | null
    coverHeight: number | null
  }>
}

function AuthorItem({ slug, name, imageUrl, books }: AuthorItemProps) {
  return (
    <div className='space-y-4 sm:flex sm:items-start sm:gap-6 sm:space-y-0'>
      <div className='flex items-center gap-4 sm:w-56 sm:shrink-0'>
        <AuthorAvatar imageUrl={imageUrl} name={name} />

        <Link href={getAuthorPath(slug)}>
          <h2 className='text-xl font-semibold transition-colors hover:text-primary'>{name}</h2>
        </Link>
      </div>

      {books.length === 0 ? (
        <p className='text-sm text-muted-foreground sm:flex-1'>No books yet.</p>
      ) : (
        <div className='grid grid-cols-2 gap-3 sm:min-w-0 sm:flex sm:flex-1 sm:gap-3 sm:overflow-x-auto sm:pb-2'>
          {books.map((book) => <AuthorBookLink key={book._id} book={book} />)}
        </div>
      )}
    </div>
  )
}

function AuthorBookLink({ book }: { book: AuthorBook }) {
  const coverAspectRatio = getBookCoverAspectRatio(book.coverWidth, book.coverHeight)

  return (
    <Link href={getBookPath(book.slug, book._id)} className='group min-w-0 sm:w-32 sm:shrink-0'>
      <div className='relative mb-2 overflow-hidden rounded-lg bg-muted' style={{ aspectRatio: coverAspectRatio }}>
        {book.coverUrl ? (
          <Image
            src={book.coverUrl}
            alt={book.title}
            fill
            className='object-cover group-hover:scale-105 transition-transform duration-200'
            sizes='(max-width: 640px) 44vw, 128px'
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center p-2 text-center text-xs text-muted-foreground'>
            {book.title}
          </div>
        )}
      </div>

      <p className='line-clamp-3 text-xs text-muted-foreground transition-colors group-hover:text-primary'>{book.title}</p>
    </Link>
  )
}

function AuthorListSkeleton() {
  return (
    <div className='space-y-8'>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className='space-y-4 sm:flex sm:items-start sm:gap-6 sm:space-y-0'>
          <div className='flex items-center gap-4 sm:w-56 sm:shrink-0'>
            <div className='h-16 w-16 shrink-0 animate-pulse rounded-full bg-muted' />
            <div className='h-6 w-48 animate-pulse rounded bg-muted' />
          </div>

          <div className='grid grid-cols-2 gap-3 sm:min-w-0 sm:flex sm:flex-1 sm:gap-3'>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className='aspect-2/3 animate-pulse rounded-lg bg-muted sm:w-32 sm:shrink-0' />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AuthorAvatar({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  if (imageUrl) {
    return (
      <div className='relative h-16 w-16 shrink-0'>
        <Image src={imageUrl} alt={name} fill className='rounded-full object-cover' sizes='64px' />
      </div>
    )
  }

  return (
    <div className='flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground'>
      {getInitial(name)}
    </div>
  )
}

function getAuthorPath(slug: string) {
  return `/authors/${slug}`
}

function getBookPath(slug: string | null | undefined, id: string) {
  return `/books/${slug ?? id}`
}

function getBookCoverAspectRatio(coverWidth: number | null, coverHeight: number | null) {
  if (!coverWidth || !coverHeight) return DEFAULT_BOOK_COVER_ASPECT_RATIO
  if (coverWidth <= 0 || coverHeight <= 0) return DEFAULT_BOOK_COVER_ASPECT_RATIO

  return coverWidth / coverHeight
}

function getInitial(name: string) {
  return name.charAt(0).toUpperCase()
}

function renderAuthorItems(authors: AuthorListItem[]) {
  return (
    <div className='space-y-8'>
      {authors.map((author) => (
        <AuthorItem key={author._id} slug={author.slug ?? author._id} name={author.name} imageUrl={author.imageUrl} books={author.books} />
      ))}
    </div>
  )
}
