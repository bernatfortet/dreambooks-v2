'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import type { FunctionReturnType } from 'convex/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import Image from 'next/image'

// TypeScript doesn't support bracket notation for slash-separated module paths in the generated API type
// Extract types from Convex queries using FunctionReturnType
// For slash-separated paths, we need to access the query function and extract its return type
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
const editionsQueryRef = (api as any)['bookEditions/queries']['listByBookId']
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
const candidatesQueryRef = (api as any)['bookCoverCandidates/queries']['listByBookId']

type EditionArray = NonNullable<FunctionReturnType<typeof editionsQueryRef>>
type Edition = EditionArray[number]

type CoverCandidateArray = NonNullable<FunctionReturnType<typeof candidatesQueryRef>>
type CoverCandidate = CoverCandidateArray[number]

type CoverOption = {
  id: string
  imageUrl: string
  source: string
  format?: string
  width?: number
  height?: number
  editionId?: Id<'bookEditions'>
  isPrimary?: boolean
  isCurrent?: boolean
  badReason?: string
}

type ChangeCoverDialogProps = {
  bookId: Id<'books'>
  currentCoverUrl?: string | null
}

export function ChangeCoverDialog({ bookId, currentCoverUrl }: ChangeCoverDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSelecting, setIsSelecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // TypeScript doesn't support bracket notation for slash-separated module paths in the generated API type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editionsQuery = (api as any)['bookEditions/queries']?.listByBookId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidatesQuery = (api as any)['bookCoverCandidates/queries']?.listByBookId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectCoverFromUrlMutation = (api as any)['bookCoverCandidates/mutations']?.selectCoverFromUrl

  const editions = useQuery(editionsQuery, bookId ? { bookId } : 'skip') as Edition[] | undefined

  const candidates = useQuery(candidatesQuery, bookId ? { bookId } : 'skip') as CoverCandidate[] | undefined

  const selectCoverFromUrl = useMutation(selectCoverFromUrlMutation)

  // Build cover options from editions and candidates
  const coverOptions = buildCoverOptions(editions, candidates, currentCoverUrl)

  async function handleSelectCover(option: CoverOption) {
    if (option.isCurrent) return

    setIsSelecting(option.id)
    setError(null)

    try {
      await selectCoverFromUrl({
        bookId,
        imageUrl: option.imageUrl,
        source: option.source,
        editionId: option.editionId,
      })
      setIsOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select cover')
    } finally {
      setIsSelecting(null)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' size='sm'>
          Change Cover
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-4xl max-h-[80vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Select Cover</DialogTitle>
          <DialogDescription>
            Choose from available cover images. Covers are collected from different editions and sources.
          </DialogDescription>
        </DialogHeader>

        {error && <div className='p-3 bg-destructive/10 text-destructive rounded-md text-sm'>{error}</div>}

        {coverOptions.length === 0 ? (
          <div className='text-muted-foreground py-8 text-center'>
            No cover options available. Covers are collected during book scraping.
          </div>
        ) : (
          <div className='grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-4'>
            {coverOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => handleSelectCover(option)}
                disabled={isSelecting !== null || option.isCurrent || !!option.badReason}
                className={cn(
                  'relative border rounded-lg p-2 text-left transition-all',
                  option.isCurrent && 'ring-2 ring-primary bg-primary/5',
                  option.badReason && 'opacity-40 cursor-not-allowed',
                  !option.isCurrent && !option.badReason && 'hover:border-primary hover:bg-accent cursor-pointer',
                  isSelecting === option.id && 'opacity-70',
                )}
              >
                <div className='relative aspect-2/3 bg-muted rounded overflow-hidden mb-2'>
                  <Image src={option.imageUrl} alt='Cover option' fill className='object-cover' sizes='(max-width: 768px) 33vw, 20vw' />
                  {option.isCurrent && (
                    <div className='absolute inset-0 bg-primary/20 flex items-center justify-center'>
                      <Badge>Current</Badge>
                    </div>
                  )}
                  {option.badReason && (
                    <div className='absolute inset-0 bg-destructive/20 flex items-center justify-center'>
                      <Badge variant='destructive' className='text-[10px]'>
                        {option.badReason}
                      </Badge>
                    </div>
                  )}
                  {isSelecting === option.id && (
                    <div className='absolute inset-0 bg-background/50 flex items-center justify-center'>
                      <span className='text-xs'>Selecting...</span>
                    </div>
                  )}
                </div>

                <div className='text-[10px] text-muted-foreground space-y-0.5'>
                  <div className='flex items-center gap-1 flex-wrap'>
                    <Badge variant='secondary' className='text-[9px] px-1 py-0'>
                      {option.source}
                    </Badge>
                    {option.format && (
                      <Badge variant='outline' className='text-[9px] px-1 py-0'>
                        {option.format}
                      </Badge>
                    )}
                    {option.isPrimary && (
                      <Badge variant='default' className='text-[9px] px-1 py-0'>
                        Primary
                      </Badge>
                    )}
                  </div>
                  {option.width && option.height && (
                    <div>
                      {option.width}×{option.height}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function buildCoverOptions(
  editions: Edition[] | undefined,
  candidates: CoverCandidate[] | undefined,
  currentCoverUrl?: string | null,
): CoverOption[] {
  const seen = new Set<string>()
  const options: CoverOption[] = []

  // Add candidates first (they have more metadata)
  if (candidates) {
    for (const candidate of candidates) {
      if (seen.has(candidate.imageUrl)) continue
      seen.add(candidate.imageUrl)

      options.push({
        id: `candidate-${candidate._id}`,
        imageUrl: candidate.imageUrl,
        source: candidate.source,
        width: candidate.width,
        height: candidate.height,
        editionId: candidate.editionId,
        isPrimary: candidate.isPrimary,
        isCurrent: currentCoverUrl === candidate.imageUrl,
        badReason: candidate.badReason,
      })
    }
  }

  // Add edition covers that aren't already in candidates
  if (editions) {
    for (const edition of editions) {
      if (!edition.mainCoverUrl) continue
      if (seen.has(edition.mainCoverUrl)) continue
      seen.add(edition.mainCoverUrl)

      options.push({
        id: `edition-${edition._id}`,
        imageUrl: edition.mainCoverUrl,
        source: 'amazon',
        format: edition.format,
        editionId: edition._id,
        isCurrent: currentCoverUrl === edition.mainCoverUrl,
      })
    }
  }

  // Sort: current first, then primary, then by resolution
  return options.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
    if (a.badReason !== b.badReason) return a.badReason ? 1 : -1

    const aRes = (a.width ?? 0) * (a.height ?? 0)
    const bRes = (b.width ?? 0) * (b.height ?? 0)
    return bRes - aRes
  })
}
