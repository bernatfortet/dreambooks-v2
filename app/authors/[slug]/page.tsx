'use client'

import { use } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { isDev } from '@/lib/env'
import { AuthorAdminPanel } from '@/components/authors/AuthorAdminPanel'
import { BookGridList } from '@/components/books/BookGrid'
import { DataDebugPanel } from '@/components/ui/DataDebugPanel'
import { PageContainer } from '@/components/ui/PageContainer'

type AuthorPageProps = {
  params: Promise<{ slug: string }>
}

export default function AuthorPage({ params }: AuthorPageProps) {
  const { slug } = use(params)
  const author = useQuery(api.authors.queries.getBySlugOrId, { slugOrId: slug })

  if (author === undefined) {
    return <AuthorDetailSkeleton />
  }

  if (author === null) {
    return (
      <PageContainer>
        <BackToAuthorsLink className='mb-4' />
        <p className='text-muted-foreground'>Author not found</p>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <BackToAuthorsLink />

      <div className='flex flex-col md:flex-row gap-8'>
        <AuthorImage imageUrl={author.imageUrlLarge ?? author.imageUrl} name={author.name} />

        <div className='flex-1 space-y-4'>
          <AuthorHeader name={author.name} bio={author.bio} bookCount={author.bookCount} />

          {author.books.length > 0 && <AuthorBooks books={author.books} />}
        </div>
      </div>

      {isDev() && <AuthorAdminPanel author={author} />}

      <DataDebugPanel data={author} label='Author Data' />
    </PageContainer>
  )
}

function BackToAuthorsLink({ className = 'mb-6' }: { className?: string }) {
  return (
    <Link href='/authors' className={`text-sm text-muted-foreground hover:underline block ${className}`}>
      ← Back to authors
    </Link>
  )
}

function AuthorImage({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  return (
    <div className='shrink-0 mx-auto md:mx-0'>
      {imageUrl ? (
        <div className='relative w-32 h-32 md:w-48 md:h-48'>
          <Image
            src={imageUrl}
            alt={name}
            fill
            className='object-cover object-center rounded-full'
            sizes='(max-width: 768px) 128px, 192px'
          />
        </div>
      ) : (
        <div className='w-32 h-32 md:w-48 md:h-48 rounded-full bg-muted flex items-center justify-center'>
          <span className='text-muted-foreground text-2xl font-medium'>{name.charAt(0).toUpperCase()}</span>
        </div>
      )}
    </div>
  )
}

function AuthorHeader({ name, bio, bookCount }: { name: string; bio: string | null; bookCount: number }) {
  return (
    <div>
      <h1 className='text-3xl font-bold'>{name}</h1>
      {bio && <p className='text-muted-foreground mt-2 leading-relaxed'>{bio}</p>}
      <p className='text-sm text-muted-foreground mt-2'>
        {bookCount} {bookCount === 1 ? 'book' : 'books'}
      </p>
    </div>
  )
}

function AuthorBooks({
  books,
}: {
  books: Array<{
    _id: string
    slug?: string | null
    title: string
    coverUrl: string | null
    seriesPosition?: number | null
  }>
}) {
  return (
    <div>
      <h2 className='font-semibold mb-4'>Books</h2>
        <BookGridList books={books.map((book) => ({ ...book, authors: [] }))} />
    </div>
  )
}

function AuthorDetailSkeleton() {
  return (
    <PageContainer>
      <div className='h-4 w-24 bg-muted rounded animate-pulse mb-6' />

      <div className='flex flex-col md:flex-row gap-8'>
        <div className='w-32 h-32 md:w-48 md:h-48 rounded-full bg-muted animate-pulse shrink-0' />

        <div className='flex-1 space-y-4'>
          <div className='h-8 bg-muted rounded animate-pulse w-1/3' />
          <div className='h-20 bg-muted rounded animate-pulse' />
        </div>
      </div>
    </PageContainer>
  )
}
