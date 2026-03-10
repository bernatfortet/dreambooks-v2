'use client'

import { useState } from 'react'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import Image from 'next/image'
import Link from 'next/link'

const AUTHOR_BOOK_COVER_HEIGHT = 120
const DEFAULT_BOOK_COVER_ASPECT_RATIO = 2 / 3

type AuthorListData = NonNullable<FunctionReturnType<typeof api.authors.queries.listWithTopBooks>>
type AuthorListItem = AuthorListData[number]
type AuthorBook = AuthorItemProps['books'][number]

export function AuthorList() {
  const authors: AuthorListData | undefined = useQuery(api.authors.queries.listWithTopBooks)

  if (authors === undefined) {
    return <AuthorListSkeleton />
  }

  if (authors.length === 0) {
    return <p className='text-center text-muted-foreground py-12'>No authors yet.</p>
  }

  return (
    <div className='space-y-8'>
      {authors.map((author: AuthorListItem) => (
        <AuthorItem key={author._id} slug={author.slug ?? author._id} name={author.name} imageUrl={author.imageUrl} books={author.books} />
      ))}
    </div>
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
    <div className='flex gap-4'>
      <div className='shrink-0'>
        {imageUrl ? (
          <div className='relative w-16 h-16'>
            <Image src={imageUrl} alt={name} fill className='rounded-full object-cover' sizes='64px' />
          </div>
        ) : (
          <div className='w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium'>
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className='flex-1'>
        <Link href={`/authors/${slug}`}>
          <h2 className='text-xl font-semibold mb-3 hover:text-primary transition-colors'>{name}</h2>
        </Link>

        {books.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No books yet.</p>
        ) : (
          <div className='flex gap-3 overflow-x-auto pb-2'>
            {books.map((book) => <AuthorBookLink key={book._id} book={book} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function AuthorBookLink({ book }: { book: AuthorBook }) {
  const [loadedAspectRatio, setLoadedAspectRatio] = useState<number | null>(null)
  const displayWidth = getBookCoverDisplayWidth(book, loadedAspectRatio)
  const coverStyle = getBookCoverStyle(displayWidth)
  const titleStyle = getBookTitleStyle(displayWidth)

  return (
    <Link href={`/books/${book.slug ?? book._id}`} className='shrink-0 group' style={titleStyle}>
      <div className='relative bg-muted rounded-lg overflow-hidden mb-1' style={coverStyle}>
        {book.coverUrl ? (
          <Image
            src={book.coverUrl}
            alt={book.title}
            fill
            className='object-cover group-hover:scale-105 transition-transform duration-200'
            sizes={`${displayWidth}px`}
            onLoad={handleBookCoverLoad(setLoadedAspectRatio)}
          />
        ) : (
          <div className='w-full h-full flex items-center justify-center text-muted-foreground text-xs p-2 text-center'>
            {book.title}
          </div>
        )}
      </div>
      <p className='text-xs text-muted-foreground line-clamp-2 group-hover:text-primary transition-colors' style={titleStyle}>{book.title}</p>
    </Link>
  )
}

function AuthorListSkeleton() {
  return (
    <div className='space-y-8'>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className='flex gap-4'>
          <div className='w-16 h-16 rounded-full bg-muted animate-pulse shrink-0' />
          <div className='flex-1 space-y-3'>
            <div className='h-6 bg-muted rounded animate-pulse w-48' />
            <div className='flex gap-3'>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className='w-20 bg-muted rounded-lg animate-pulse shrink-0' style={{ height: `${AUTHOR_BOOK_COVER_HEIGHT}px` }} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function getBookCoverDisplayWidth(book: AuthorBook, loadedAspectRatio?: number | null) {
  const coverAspectRatio = loadedAspectRatio ?? getBookCoverAspectRatio(book.coverWidth, book.coverHeight)
  const displayWidth = Math.round(AUTHOR_BOOK_COVER_HEIGHT * coverAspectRatio)

  return displayWidth
}

function handleBookCoverLoad(setLoadedAspectRatio: (aspectRatio: number) => void) {
  return (event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget
    const intrinsicAspectRatio = getBookCoverAspectRatio(image.naturalWidth, image.naturalHeight)

    setLoadedAspectRatio(intrinsicAspectRatio)
  }
}

function getBookCoverStyle(displayWidth: number) {
  return {
    width: `${displayWidth}px`,
    height: `${AUTHOR_BOOK_COVER_HEIGHT}px`,
  }
}

function getBookTitleStyle(displayWidth: number) {
  return { width: `${displayWidth}px` }
}

function getBookCoverAspectRatio(coverWidth: number | null, coverHeight: number | null) {
  if (!coverWidth || !coverHeight) return DEFAULT_BOOK_COVER_ASPECT_RATIO
  if (coverWidth <= 0 || coverHeight <= 0) return DEFAULT_BOOK_COVER_ASPECT_RATIO

  return coverWidth / coverHeight
}
