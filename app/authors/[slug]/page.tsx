import { fetchQuery } from 'convex/nextjs'
import type { FunctionReturnType } from 'convex/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, ExternalLink, Instagram } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { SuperadminOnly } from '@/components/auth/SuperadminOnly'
import { AuthorAdminPanel } from '@/components/authors/AuthorAdminPanel'
import { AuthorProfileActions } from '@/components/authors/AuthorProfileActions'
import { ExpandableDescription } from '@/components/books/ExpandableDescription'
import { BookMasonryList } from '@/components/books/masonry'
import { DataDebugPanel } from '@/components/ui/DataDebugPanel'
import { PageContainer } from '@/components/ui/PageContainer'

type AuthorPageProps = {
  params: Promise<{ slug: string }>
}

export const revalidate = 3600

type AuthorData = NonNullable<FunctionReturnType<typeof api.authors.queries.getBySlugOrId>>
type AuthorBook = AuthorData['books'][number]

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { slug } = await params
  const author = await fetchQuery(api.authors.queries.getBySlugOrId, { slugOrId: slug })

  if (!author) return { title: 'Author Not Found' }

  const description = author.bio
    ? author.bio.slice(0, 155) + (author.bio.length > 155 ? '…' : '')
    : `Explore ${author.bookCount} ${author.bookCount === 1 ? 'book' : 'books'} by ${author.name} on Dreambooks.`

  return {
    title: author.name,
    description,
    openGraph: {
      title: author.name,
      description,
      ...(author.imageUrlLarge ?? author.imageUrl ? { images: [author.imageUrlLarge ?? author.imageUrl!] } : {}),
    },
  }
}

export default async function AuthorPage({ params }: AuthorPageProps) {
  const { slug } = await params
  const author = await fetchQuery(api.authors.queries.getBySlugOrId, { slugOrId: slug })

  if (author === null) {
    return (
      <PageContainer>
        <BackToAuthorsLink className='mb-4' />
        <p className='text-muted-foreground'>Author not found.</p>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <BackToAuthorsLink />

      <div className='mb-10 flex flex-col items-center gap-6 md:flex-row md:items-start md:gap-10'>
        <AuthorImage imageUrl={author.imageUrlLarge ?? author.imageUrl} name={author.name} />

        <div className='min-w-0 flex-1 text-center md:text-left'>
          <AuthorHeader
            authorId={author._id}
            name={author.name}
            bio={author.bio}
            bookCount={author.bookCount}
            instagramHandle={author.instagramHandle}
            instagramUrl={author.instagramUrl}
          />
        </div>
      </div>

      {author.books.length > 0 && <AuthorBooks books={author.books} />}

      <SuperadminOnly>
        <AuthorAdminPanel author={author} />
      </SuperadminOnly>

      <SuperadminOnly>
        <DataDebugPanel data={author} label='Author Data' />
      </SuperadminOnly>
    </PageContainer>
  )
}

function BackToAuthorsLink({ className = 'mb-6' }: { className?: string }) {
  return (
    <Link
      href='/authors'
      className={`group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      <ArrowLeft aria-hidden='true' className='size-3.5 transition-transform group-hover:-translate-x-0.5' />
      Back to Authors
    </Link>
  )
}

function AuthorImage({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  return (
    <div className='shrink-0'>
      {imageUrl ? (
        <div className='relative size-28 md:size-36'>
          <Image
            src={imageUrl}
            alt={`Photo of ${name}`}
            fill
            priority
            className='rounded-full object-cover object-center'
            sizes='(max-width: 768px) 112px, 144px'
          />
        </div>
      ) : (
        <div className='flex size-28 items-center justify-center rounded-full bg-muted md:size-36'>
          <span className='text-2xl font-semibold text-muted-foreground md:text-3xl'>
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  )
}

function AuthorHeader(params: {
  authorId: AuthorData['_id']
  name: string
  bio: string | null
  bookCount: number
  instagramHandle: string | null
  instagramUrl: string | null
}) {
  const { authorId, name, bio, bookCount, instagramHandle, instagramUrl } = params

  return (
    <div>
      <h1 className='text-3xl font-bold tracking-tight text-pretty'>{name}</h1>

      <div className='mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground'>
        <p>
          {bookCount} {bookCount === 1 ? 'book' : 'books'}
        </p>

        {instagramHandle && instagramUrl && (
          <a
            href={instagramUrl}
            target='_blank'
            rel='noreferrer'
            className='inline-flex items-center gap-1.5 transition-colors hover:text-foreground'
          >
            <Instagram aria-hidden='true' className='size-3.5' />
            @{instagramHandle}
            <ExternalLink aria-hidden='true' className='size-3' />
          </a>
        )}

        <AuthorProfileActions authorId={authorId} />
      </div>

      {bio && (
        <div className='mt-4'>
          <ExpandableDescription description={bio} />
        </div>
      )}
    </div>
  )
}

function AuthorBooks({ books }: { books: AuthorData['books'] }) {
  const sortedBooks = sortAuthorBooks(books)
  const masonryBooks = sortedBooks.map((book: AuthorBook) => ({ ...book, authors: book.authors ?? [] }))

  return (
    <section>
      <h2 className='mb-5 text-xl font-semibold text-pretty'>Books</h2>
      <BookMasonryList books={masonryBooks} layoutMode='row-major' />
    </section>
  )
}

function sortAuthorBooks(books: AuthorData['books']): AuthorData['books'] {
  return books.toSorted((leftBook: AuthorBook, rightBook: AuthorBook) => {
    const leftSeriesKey = getSeriesSortKey(leftBook)
    const rightSeriesKey = getSeriesSortKey(rightBook)

    if (leftSeriesKey && rightSeriesKey) {
      if (leftSeriesKey !== rightSeriesKey) {
        return leftSeriesKey.localeCompare(rightSeriesKey)
      }

      return compareBooksWithinSeries(leftBook, rightBook)
    }

    if (leftSeriesKey) return -1
    if (rightSeriesKey) return 1

    return leftBook.title.localeCompare(rightBook.title)
  })
}

function compareBooksWithinSeries(leftBook: AuthorBook, rightBook: AuthorBook) {
  const leftSeriesPosition = leftBook.seriesPosition ?? Number.POSITIVE_INFINITY
  const rightSeriesPosition = rightBook.seriesPosition ?? Number.POSITIVE_INFINITY

  if (leftSeriesPosition !== rightSeriesPosition) {
    return leftSeriesPosition - rightSeriesPosition
  }

  return leftBook.title.localeCompare(rightBook.title)
}

function getSeriesSortKey(book: AuthorBook) {
  if (book.seriesId) return `id:${book.seriesId}`
  if (book.seriesName) return `name:${book.seriesName.toLowerCase()}`

  return null
}

