import Link from 'next/link'
import type React from 'react'
import { Building2, Calendar, FileText, BookOpen, GraduationCap, Youtube, BabyIcon } from 'lucide-react'
import { AmazonIcon } from '@/components/icons/amazon-icon'
import { Button } from '@/components/ui/button'
import { ExpandableDescription } from '@/components/books/ExpandableDescription'
import { toSlug } from '@/lib/scraping/utils/slug'
import { api } from '@/convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'

type Book = NonNullable<FunctionReturnType<typeof api.books.queries.getBySlugOrId>>

type BookDetailsProps = {
  book: Book
}

// Role priority order (matches Amazon's display order)
const ROLE_PRIORITY: Record<string, number> = {
  author: 1,
  illustrator: 2,
  editor: 3,
  translator: 4,
  narrator: 5,
  other: 6,
}

type DisplayContributor = {
  name: string
  slug: string
  roles: string[]
}

function sortRolesByPriority(roles: string[]): string[] {
  return [...roles].sort((a, b) => {
    const aPriority = ROLE_PRIORITY[a] ?? 99
    const bPriority = ROLE_PRIORITY[b] ?? 99
    return aPriority - bPriority
  })
}

function matchContributorToLinkedAuthor(
  contributor: { name: string; amazonAuthorId?: string },
  linkedAuthorsByAmazonId: Map<string, NonNullable<Book['linkedAuthors']>[number]>,
  linkedAuthorsByName: Map<string, NonNullable<Book['linkedAuthors']>[number]>,
): NonNullable<Book['linkedAuthors']>[number] | null {
  if (contributor.amazonAuthorId) {
    const byAmazonId = linkedAuthorsByAmazonId.get(contributor.amazonAuthorId)
    if (byAmazonId) return byAmazonId
  }
  return linkedAuthorsByName.get(contributor.name.toLowerCase()) ?? null
}

function buildDisplayContributors(
  contributors: Book['contributors'],
  linkedAuthors: Book['linkedAuthors'],
  authors: Book['authors'],
): DisplayContributor[] {
  const displayContributors: DisplayContributor[] = []

  // Build lookup maps for linked authors
  const linkedAuthorsByAmazonId = new Map<string, NonNullable<typeof linkedAuthors>[number]>()
  const linkedAuthorsByName = new Map<string, NonNullable<typeof linkedAuthors>[number]>()
  if (linkedAuthors) {
    for (const linkedAuthor of linkedAuthors) {
      if (linkedAuthor.amazonAuthorId) {
        linkedAuthorsByAmazonId.set(linkedAuthor.amazonAuthorId, linkedAuthor)
      }
      linkedAuthorsByName.set(linkedAuthor.name.toLowerCase(), linkedAuthor)
    }
  }

  if (contributors && contributors.length > 0) {
    const contributorsByLinkedAuthor = new Map<string, { linkedAuthor: NonNullable<typeof linkedAuthors>[number]; roles: string[] }>()
    const unlinkedContributors = new Map<string, string[]>()

    for (const contributor of contributors) {
      const linkedAuthor = matchContributorToLinkedAuthor(contributor, linkedAuthorsByAmazonId, linkedAuthorsByName)

      if (linkedAuthor) {
        const key = linkedAuthor._id
        const existing = contributorsByLinkedAuthor.get(key) ?? { linkedAuthor, roles: [] }
        if (!existing.roles.includes(contributor.role)) {
          existing.roles.push(contributor.role)
        }
        contributorsByLinkedAuthor.set(key, existing)
      } else {
        const existing = unlinkedContributors.get(contributor.name) ?? []
        if (!existing.includes(contributor.role)) {
          existing.push(contributor.role)
        }
        unlinkedContributors.set(contributor.name, existing)
      }
    }

    for (const { linkedAuthor, roles } of contributorsByLinkedAuthor.values()) {
      displayContributors.push({
        name: linkedAuthor.name,
        slug: linkedAuthor.slug ?? linkedAuthor._id,
        roles: sortRolesByPriority(roles),
      })
    }

    for (const [name, roles] of unlinkedContributors.entries()) {
      displayContributors.push({
        name,
        slug: toSlug(name),
        roles: sortRolesByPriority(roles),
      })
    }
  } else if (linkedAuthors && linkedAuthors.length > 0) {
    for (const linkedAuthor of linkedAuthors) {
      displayContributors.push({
        name: linkedAuthor.name,
        slug: linkedAuthor.slug ?? linkedAuthor._id,
        roles: linkedAuthor.role ? [linkedAuthor.role] : [],
      })
    }
  } else {
    for (const authorName of authors) {
      displayContributors.push({
        name: authorName,
        slug: toSlug(authorName),
        roles: [],
      })
    }
  }

  return displayContributors
}

export function BookHeading({ book }: { book: Book }) {
  const { title, subtitle, authors, contributors, linkedAuthors, seriesId, seriesName, seriesPosition, seriesInfo, description } = book

  const displayContributors = buildDisplayContributors(contributors, linkedAuthors, authors)
  const seriesTotalCount =
    (seriesInfo as { expectedBookCount?: number | null })?.expectedBookCount ??
    seriesInfo?.discoveredBookCount ??
    (seriesInfo as { scrapedBookCount?: number | null })?.scrapedBookCount ??
    null

  return (
    <>
      <div>
        <h1 className='text-3xl font-bold'>{title}</h1>
        {subtitle && <p className='text-lg text-muted-foreground mt-1'>{subtitle}</p>}

        <div className='flex items-center text-sm mt-2 flex-wrap'>
          <span className='text-muted-foreground mr-1 relative z-1'>by</span>
          {displayContributors.map((contributor, index) => (
            <span key={`${contributor.name}-${index}`} className='flex items-center gap-1'>
              <Button variant='ghost' size='xsm' asChild>
                <Link href={`/authors/${contributor.slug}`}>{contributor.name}</Link>
              </Button>
              {contributor.roles.length > 0 && (
                <span className='text-muted-foreground'>({contributor.roles.map(formatRole).join(', ')})</span>
              )}
              {index < displayContributors.length - 1 && <span className='text-muted-foreground'>,</span>}
            </span>
          ))}
          {seriesId && seriesName && (
            <>
              <span className='text-muted-foreground mx-1'>·</span>
              <Button variant='ghost' size='xsm' asChild>
                <Link href={`/series/${seriesInfo?.slug ?? seriesId}`}>
                  {formatSeriesLabel(seriesName, seriesPosition, seriesTotalCount)}
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {description && <ExpandableDescription description={description} />}
    </>
  )
}

export function BookMetaDetails({ book }: { book: Book }) {
  const { publisher, publishedDate, pageCount, lexileScore, ageRange, gradeLevel } = book

  return (
    <div className='grid grid-cols-2 gap-x-4 gap-y-2 text-sm pt-4'>
      {publisher && (
        <div className='flex items-center gap-2'>
          <Building2 className='h-4 w-4 text-muted-foreground' />
          <span className='text-muted-foreground'>Publisher:</span>
          <Button variant='ghost' size='sm' asChild>
            <Link href={`/publishers/${toSlug(publisher)}`} className='font-medium'>
              {publisher}
            </Link>
          </Button>
        </div>
      )}
      {publishedDate && <MetaItem label='Published' value={publishedDate} icon={Calendar} />}
      {pageCount && <MetaItem label='Pages' value={String(pageCount)} icon={FileText} />}
      {lexileScore && <MetaItem label='Lexile' value={String(lexileScore)} icon={BookOpen} />}
      {ageRange && <MetaItem label='Age Range' value={ageRange} icon={BabyIcon} />}
      {gradeLevel && <MetaItem label='Grade Level' value={gradeLevel} icon={GraduationCap} />}
    </div>
  )
}

export function BookLinks({ book }: { book: Book }) {
  const { title, authors, amazonUrl } = book

  return (
    <div className='pt-4 border-t flex flex-col flex-wrap items-start'>
      {amazonUrl && <ExternalLink href={amazonUrl} icon={AmazonIcon} label='Buy on Amazon' />}
      <ExternalLink href={getYouTubeSearchUrl(title, authors)} icon={Youtube} label='YouTube Reviews and Read-Alouds' />
    </div>
  )
}

export function BookDetails({ book }: BookDetailsProps) {
  return (
    <div className='flex-1 space-y-4'>
      <BookHeading book={book} />
      <BookMetaDetails book={book} />
      <BookLinks book={book} />
    </div>
  )
}

export function BookDetailsSkeleton() {
  return (
    <div className='flex-1 space-y-4'>
      <div className='h-8 bg-muted rounded animate-pulse w-3/4' />
      <div className='h-4 bg-muted rounded animate-pulse w-1/2' />
      <div className='h-20 bg-muted rounded animate-pulse' />
    </div>
  )
}

function getYouTubeSearchUrl(title: string, authors: string[]): string {
  const query = [title, ...authors].join('+')
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}

function ExternalLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Button variant='ghost' size='sm' asChild>
      <a href={href} target='_blank' rel='noopener noreferrer'>
        <Icon className='h-4 w-4' />
        <span>{label}</span>
      </a>
    </Button>
  )
}

function formatRole(role: string): string {
  // Capitalize first letter: 'author' -> 'Author', 'illustrator' -> 'Illustrator'
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function formatSeriesLabel(seriesName: string, position?: number | null, totalCount?: number | null): string {
  if (position && totalCount) {
    return `Book ${position} of ${totalCount}: ${seriesName}`
  }
  if (position) {
    return `Book ${position}: ${seriesName}`
  }
  if (totalCount) {
    return `${seriesName} (${totalCount} books)`
  }
  return seriesName
}

function MetaItem({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className='flex items-center gap-2'>
      {Icon && <Icon className='h-4 w-4 text-muted-foreground' />}
      <span className='text-muted-foreground'>{label}:</span> <span className='font-medium'>{value}</span>
    </div>
  )
}
