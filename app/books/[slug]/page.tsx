import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchQuery } from 'convex/nextjs'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/ui/PageContainer'

type BookPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { slug } = await params
  const book = await getBook(slug)

  if (!book) {
    return {
      title: 'Book not found',
    }
  }

  const description = book.description ?? buildFallbackDescription(book)

  return {
    title: book.title,
    description,
  }
}

export default async function BookPage({ params }: BookPageProps) {
  const { slug } = await params
  const book = await getBook(slug)

  if (!book) notFound()

  const metadataItems = getMetadataItems(book)
  const authorNames = getAuthorNames(book)

  return (
    <PageContainer className='space-y-8'>
      <nav className='flex items-center gap-2 text-sm text-muted-foreground'>
        <Link href='/' className='hover:text-foreground'>
          Books
        </Link>
        <span>/</span>
        <span className='line-clamp-1 text-foreground'>{book.title}</span>
      </nav>

      <div className='grid gap-8 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]'>
        <aside className='space-y-4'>
          <div className='overflow-hidden rounded-xl border bg-muted'>
            {book.coverUrlFull || book.coverUrl ? (
              <Image
                src={book.coverUrlFull ?? book.coverUrl!}
                alt={book.title}
                width={book.coverWidth ?? 600}
                height={book.coverHeight ?? 900}
                className='h-auto w-full object-cover'
                priority
              />
            ) : (
              <div className='flex aspect-[2/3] items-center justify-center p-6 text-center text-sm text-muted-foreground'>
                Cover unavailable
              </div>
            )}
          </div>

          {book.amazonUrl && (
            <Button asChild className='w-full'>
              <a href={book.amazonUrl} target='_blank' rel='noreferrer'>
                View on Amazon
              </a>
            </Button>
          )}
        </aside>

        <section className='space-y-8'>
          <div className='space-y-4'>
            <div className='flex flex-wrap gap-2'>
              {book.seriesInfo?.name && <Badge variant='secondary'>{book.seriesInfo.name}</Badge>}
              {book.seriesPosition !== undefined && book.seriesPosition !== null && (
                <Badge variant='outline'>Book #{book.seriesPosition}</Badge>
              )}
              {book.detailsStatus && <Badge variant='outline'>{book.detailsStatus}</Badge>}
            </div>

            <div className='space-y-2'>
              <h1 className='text-3xl font-bold tracking-tight sm:text-4xl'>{book.title}</h1>
              {book.subtitle && <p className='text-xl text-muted-foreground'>{book.subtitle}</p>}
              <p className='text-base text-muted-foreground'>{authorNames.join(', ')}</p>
            </div>
          </div>

          {book.description && (
            <section className='space-y-2'>
              <h2 className='text-xl font-semibold'>About this book</h2>
              <p className='whitespace-pre-line text-muted-foreground'>{book.description}</p>
            </section>
          )}

          {metadataItems.length > 0 && (
            <section className='space-y-3'>
              <h2 className='text-xl font-semibold'>Details</h2>
              <dl className='grid gap-4 rounded-xl border p-4 sm:grid-cols-2'>
                {metadataItems.map((item) => (
                  <div key={item.label} className='space-y-1'>
                    <dt className='text-sm font-medium text-muted-foreground'>{item.label}</dt>
                    <dd className='text-sm text-foreground'>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </section>
      </div>
    </PageContainer>
  )
}

type BookPageData = NonNullable<FunctionReturnType<typeof api.books.queries.getBySlugOrId>>
type BookContributor = {
  name: string
  role: string
}

async function getBook(slugOrId: string) {
  const book = await fetchQuery(api.books.queries.getBySlugOrId, { slugOrId })
  return book
}

function getAuthorNames(book: BookPageData) {
  if (book.contributors && book.contributors.length > 0) {
    const contributors = book.contributors as BookContributor[]
    const primaryContributors = contributors
      .filter((contributor) => contributor.role.toLowerCase() === 'author')
      .map((contributor) => contributor.name)

    if (primaryContributors.length > 0) return primaryContributors

    const contributorNames = contributors.map((contributor) => contributor.name)
    if (contributorNames.length > 0) return contributorNames
  }

  if (book.authors.length > 0) return book.authors

  return ['Unknown author']
}

function getMetadataItems(book: BookPageData) {
  const items = [
    { label: 'Publisher', value: book.publisher },
    { label: 'Published', value: book.publishedDate },
    { label: 'Pages', value: formatNumber(book.pageCount) },
    { label: 'Lexile', value: formatLexile(book.lexileScore) },
    { label: 'Age range', value: formatRange(book.ageRangeMin, book.ageRangeMax, book.ageRange) },
    { label: 'Grade level', value: formatGradeLevel(book.gradeLevelMin, book.gradeLevelMax, book.gradeLevel) },
    { label: 'ISBN-10', value: book.isbn10 },
    { label: 'ISBN-13', value: book.isbn13 },
    { label: 'ASIN', value: book.asin },
  ]

  return items.filter((item): item is { label: string; value: string } => Boolean(item.value))
}

function buildFallbackDescription(book: BookPageData) {
  const authorNames = getAuthorNames(book).join(', ')
  const seriesText =
    book.seriesInfo?.name && book.seriesPosition !== undefined && book.seriesPosition !== null
      ? ` Book ${book.seriesPosition} in the ${book.seriesInfo.name} series.`
      : book.seriesInfo?.name
        ? ` Part of the ${book.seriesInfo.name} series.`
        : ''

  return `${book.title} by ${authorNames}.${seriesText}`
}

function formatNumber(value: number | undefined) {
  if (value === undefined) return null
  return `${value}`
}

function formatLexile(value: number | undefined) {
  if (value === undefined) return null
  return `${value}L`
}

function formatRange(min: number | undefined, max: number | undefined, fallback: string | undefined) {
  if (min !== undefined && max !== undefined) {
    return `${min}-${max} years`
  }

  return fallback ?? null
}

function formatGradeLevel(min: number | undefined, max: number | undefined, fallback: string | undefined) {
  if (min !== undefined && max !== undefined) {
    return `${formatGradeValue(min)}-${formatGradeValue(max)}`
  }

  return fallback ?? null
}

function formatGradeValue(value: number) {
  if (value === -1) return 'Pre-K'
  if (value === 0) return 'K'
  return `${value}`
}
