'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type IntakeStats = NonNullable<FunctionReturnType<typeof api.bookIntake.queries.stats>>
type IntakeQueue = NonNullable<FunctionReturnType<typeof api.bookIntake.queries.listQueue>>
type IntakeItem = IntakeQueue[number]

type CandidateSnapshot = {
  existingCandidates?: Array<{
    bookId: Id<'books'>
    title: string
    authors: string[]
    slug: string | null
    amazonUrl?: string
    score: number
  }>
  amazonCandidates?: Array<{
    asin: string
    amazonUrl: string
    title: string
    byline?: string
    score: number
    rank: number
  }>
}

const ACTIVE_STATUSES = ['pending', 'researching', 'waiting_for_scrape', 'needs_review', 'failed'] as const

export function BookIntakeSection() {
  const intakeStats = useQuery(api.bookIntake.queries.stats)
  const intakeItems = useQuery(api.bookIntake.queries.listQueue, {
    statuses: [...ACTIVE_STATUSES],
    limit: 100,
  })

  return (
    <section className='mb-8 space-y-4'>
      <div className='flex items-center gap-2'>
        <h2 className='text-xl font-semibold'>Book Intake Queue</h2>
        <StatusSummaryBadges stats={intakeStats} />
      </div>

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>Manual title and author intake</CardTitle>
        </CardHeader>
        <CardContent>
          <BookIntakeForm />
        </CardContent>
      </Card>

      {intakeItems && intakeItems.length > 0 && (
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Active intake items</CardTitle>
            <p className='text-sm text-muted-foreground'>
              Handled items stay in intake for provenance and dedupe, but linked rows are hidden from this default queue.
            </p>
          </CardHeader>
          <CardContent className='space-y-3'>
            {intakeItems.map((item) => (
              <BookIntakeRow key={item._id} item={item} />
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  )
}

function BookIntakeForm() {
  const enqueueManual = useMutation(api.bookIntake.mutations.enqueueManual)

  const [title, setTitle] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [illustratorName, setIllustratorName] = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!title.trim()) return

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await enqueueManual({
        title,
        authorName,
        illustratorName,
        sourceLabel,
      })

      setSuccess(result.created ? 'Added to intake queue.' : 'That intake item already exists.')

      if (result.created) resetForm()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to queue intake item')
    } finally {
      setIsSubmitting(false)
    }
  }

  function resetForm() {
    setTitle('')
    setAuthorName('')
    setIllustratorName('')
    setSourceLabel('')
  }

  return (
    <div className='space-y-3'>
      <p className='text-sm text-muted-foreground'>
        Add a book by `title + author` first, then let the intake worker research it and hand confirmed URLs into scraping.
      </p>

      <form onSubmit={handleSubmit} className='grid gap-2 md:grid-cols-2'>
        <Input placeholder='Title' value={title} onChange={(event) => setTitle(event.target.value)} disabled={isSubmitting} />
        <Input
          placeholder='Author name'
          value={authorName}
          onChange={(event) => setAuthorName(event.target.value)}
          disabled={isSubmitting}
        />
        <Input
          placeholder='Illustrator name (optional)'
          value={illustratorName}
          onChange={(event) => setIllustratorName(event.target.value)}
          disabled={isSubmitting}
        />
        <Input
          placeholder='Source label (optional)'
          value={sourceLabel}
          onChange={(event) => setSourceLabel(event.target.value)}
          disabled={isSubmitting}
        />
        <div className='md:col-span-2 flex items-center gap-2'>
          <Button type='submit' disabled={isSubmitting || !title.trim()}>
            {isSubmitting ? 'Adding...' : 'Add to Intake'}
          </Button>
          {error && <p className='text-sm text-destructive'>{error}</p>}
          {success && <p className='text-sm text-green-600'>{success}</p>}
        </div>
      </form>
    </div>
  )
}

function BookIntakeRow({ item }: { item: IntakeItem }) {
  const retryIntake = useMutation(api.bookIntake.mutations.retry)
  const resolveExisting = useMutation(api.bookIntake.mutations.markResolvedExisting)
  const readyToScrape = useMutation(api.bookIntake.mutations.markReadyToScrape)
  const markFailed = useMutation(api.bookIntake.mutations.markFailed)

  const [overrideUrl, setOverrideUrl] = useState(item.matchedAmazonUrl ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const snapshot = parseCandidateSnapshot(item.candidateSnapshotJson)

  async function handleRetry() {
    await runMutation({
      action: async () => {
        await retryIntake({ intakeId: item._id })
      },
      setError,
      setIsSubmitting,
    })
  }

  async function handleDismiss() {
    await runMutation({
      action: async () => {
        await markFailed({
          intakeId: item._id,
          errorMessage: 'Dismissed from intake queue',
        })
      },
      setError,
      setIsSubmitting,
    })
  }

  async function handleResolveExisting(bookId: Id<'books'>) {
    await runMutation({
      action: async () => {
        await resolveExisting({
          intakeId: item._id,
          bookId,
        })
      },
      setError,
      setIsSubmitting,
    })
  }

  async function handleSendToScrape(amazonUrl: string) {
    await runMutation({
      action: async () => {
        await readyToScrape({
          intakeId: item._id,
          amazonUrl,
        })
      },
      setError,
      setIsSubmitting,
    })
  }

  return (
    <div className='rounded-md border p-3 space-y-3'>
      <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
        <BookIntakeMeta item={item} />

        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' size='sm' onClick={handleRetry} disabled={isSubmitting}>
            Retry
          </Button>
          <Button variant='outline' size='sm' onClick={handleDismiss} disabled={isSubmitting}>
            Dismiss
          </Button>
        </div>
      </div>

      <ExistingCandidates
        candidates={snapshot?.existingCandidates}
        isSubmitting={isSubmitting}
        onResolveExisting={handleResolveExisting}
      />

      <AmazonCandidates
        candidates={snapshot?.amazonCandidates}
        isSubmitting={isSubmitting}
        onSendToScrape={handleSendToScrape}
      />

      <OverrideUrlForm
        overrideUrl={overrideUrl}
        isSubmitting={isSubmitting}
        onOverrideUrlChange={setOverrideUrl}
        onSendToScrape={handleSendToScrape}
      />

      {error && <p className='text-sm text-destructive'>{error}</p>}
    </div>
  )
}

function BookIntakeMeta({ item }: { item: IntakeItem }) {
  const contributorLine = buildContributorLine(item)

  return (
    <div className='space-y-1'>
      <div className='flex items-center gap-2 flex-wrap'>
        <p className='text-sm font-medium'>{item.title}</p>
        <Badge variant={getStatusVariant(item.status)}>{formatStatusLabel(item.status)}</Badge>
        {item.linkedAwardName && <Badge variant='outline'>{item.linkedAwardName}</Badge>}
      </div>
      {contributorLine && <p className='text-sm text-muted-foreground'>{contributorLine}</p>}
      {item.sourceLabel && <p className='text-sm text-muted-foreground'>Source: {item.sourceLabel}</p>}
      {item.needsReviewReason && <p className='text-sm text-muted-foreground'>{item.needsReviewReason}</p>}
      {item.lastError && <p className='text-sm text-destructive'>{item.lastError}</p>}
      {item.matchedBook && (
        <p className='text-sm text-muted-foreground'>
          Linked book:{' '}
          <Link href={`/books/${item.matchedBook.slug ?? item.matchedBook._id}`} className='text-blue-500 hover:underline'>
            {item.matchedBook.title}
          </Link>
        </p>
      )}
    </div>
  )
}

function CandidateGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{title}</p>
      <div className='space-y-2'>{children}</div>
    </div>
  )
}

function ExistingCandidates(params: {
  candidates: CandidateSnapshot['existingCandidates']
  isSubmitting: boolean
  onResolveExisting: (bookId: Id<'books'>) => Promise<void>
}) {
  const { candidates, isSubmitting, onResolveExisting } = params
  if (!candidates?.length) return null

  return (
    <CandidateGroup title='Existing matches'>
      {candidates.slice(0, 3).map((candidate) => (
        <div key={candidate.bookId} className='flex flex-col gap-2 rounded border p-2 md:flex-row md:items-center md:justify-between'>
          <div className='text-sm'>
            <p className='font-medium'>{candidate.title}</p>
            <p className='text-muted-foreground'>{candidate.authors.join(', ')}</p>
            <p className='text-muted-foreground'>Score: {candidate.score.toFixed(2)}</p>
          </div>
          <div className='flex gap-2'>
            <Link
              href={`/books/${candidate.slug ?? candidate.bookId}`}
              className='inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted'
            >
              Open
            </Link>
            <Button variant='outline' size='sm' onClick={() => onResolveExisting(candidate.bookId)} disabled={isSubmitting}>
              Use this book
            </Button>
          </div>
        </div>
      ))}
    </CandidateGroup>
  )
}

function AmazonCandidates(params: {
  candidates: CandidateSnapshot['amazonCandidates']
  isSubmitting: boolean
  onSendToScrape: (amazonUrl: string) => Promise<void>
}) {
  const { candidates, isSubmitting, onSendToScrape } = params
  if (!candidates?.length) return null

  return (
    <CandidateGroup title='Amazon candidates'>
      {candidates.slice(0, 3).map((candidate) => (
        <div key={`${candidate.asin}-${candidate.rank}`} className='flex flex-col gap-2 rounded border p-2 md:flex-row md:items-center md:justify-between'>
          <div className='text-sm'>
            <p className='font-medium'>{candidate.title}</p>
            {candidate.byline && <p className='text-muted-foreground'>{candidate.byline}</p>}
            <p className='text-muted-foreground'>Score: {candidate.score.toFixed(2)}</p>
          </div>
          <div className='flex gap-2'>
            <a
              href={candidate.amazonUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted'
            >
              Amazon
            </a>
            <Button variant='outline' size='sm' onClick={() => onSendToScrape(candidate.amazonUrl)} disabled={isSubmitting}>
              Send to scrape
            </Button>
          </div>
        </div>
      ))}
    </CandidateGroup>
  )
}

function OverrideUrlForm(params: {
  overrideUrl: string
  isSubmitting: boolean
  onOverrideUrlChange: (value: string) => void
  onSendToScrape: (amazonUrl: string) => Promise<void>
}) {
  const { overrideUrl, isSubmitting, onOverrideUrlChange, onSendToScrape } = params

  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>Manual Amazon URL override</p>
      <div className='flex flex-col gap-2 md:flex-row'>
        <Input
          placeholder='https://www.amazon.com/dp/...'
          value={overrideUrl}
          onChange={(event) => onOverrideUrlChange(event.target.value)}
          disabled={isSubmitting}
        />
        <Button variant='outline' onClick={() => onSendToScrape(overrideUrl)} disabled={isSubmitting || !overrideUrl.trim()}>
          Queue URL
        </Button>
      </div>
    </div>
  )
}

function StatusSummaryBadges({ stats }: { stats: IntakeStats | undefined }) {
  if (!stats) return null

  return (
    <div className='flex gap-2 text-sm'>
      {stats.pending > 0 && <Badge variant='secondary'>{stats.pending} pending</Badge>}
      {stats.researching > 0 && <Badge variant='outline'>{stats.researching} researching</Badge>}
      {stats.waitingForScrape > 0 && <Badge variant='default'>{stats.waitingForScrape} waiting</Badge>}
      {stats.needsReview > 0 && <Badge variant='secondary'>{stats.needsReview} review</Badge>}
      {stats.failed > 0 && <Badge variant='destructive'>{stats.failed} failed</Badge>}
    </div>
  )
}

function parseCandidateSnapshot(value: string | null): CandidateSnapshot | null {
  if (!value) return null

  try {
    return JSON.parse(value) as CandidateSnapshot
  } catch {
    return null
  }
}

function formatStatusLabel(status: IntakeItem['status']) {
  return status.replace(/_/g, ' ')
}

function getStatusVariant(status: IntakeItem['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'failed') return 'destructive'
  if (status === 'needs_review') return 'secondary'
  if (status === 'waiting_for_scrape') return 'default'
  return 'outline'
}

function buildContributorLine(item: IntakeItem) {
  return [
    item.authorName ? `Author: ${item.authorName}` : null,
    item.illustratorName ? `Illustrator: ${item.illustratorName}` : null,
  ]
    .filter(Boolean)
    .join(' | ')
}

async function runMutation(params: {
  action: () => Promise<void>
  setError: (value: string | null) => void
  setIsSubmitting: (value: boolean) => void
}) {
  params.setIsSubmitting(true)
  params.setError(null)

  try {
    await params.action()
  } catch (error) {
    params.setError(error instanceof Error ? error.message : 'Request failed')
  } finally {
    params.setIsSubmitting(false)
  }
}
