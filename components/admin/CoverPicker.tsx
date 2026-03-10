'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Image from 'next/image'

type CoverPickerProps = {
  bookId: Id<'books'>
  currentCoverUrl?: string | null
  onCoverSelected?: () => void
}

export function CoverPicker({ bookId, currentCoverUrl, onCoverSelected }: CoverPickerProps) {
  const [isSelecting, setIsSelecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const candidates = useQuery((api as any).bookCoverCandidates?.queries?.listByBookId, bookId ? { bookId } : 'skip')
  const selectCandidate = useMutation((api as any).bookCoverCandidates?.mutations?.selectCandidate)
  const markBad = useMutation((api as any).bookCoverCandidates?.mutations?.markBad)

  if (!candidates) {
    return <div className='text-muted-foreground'>Loading cover candidates...</div>
  }

  if (candidates.length === 0) {
    return <div className='text-muted-foreground'>No cover candidates found. Cover candidates are collected during book scraping.</div>
  }

  async function handleSelect(candidateId: Id<'bookCoverCandidates'>) {
    setIsSelecting(candidateId)
    setError(null)

    try {
      await selectCandidate({ candidateId })
      onCoverSelected?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select cover')
    } finally {
      setIsSelecting(null)
    }
  }

  async function handleMarkBad(candidateId: Id<'bookCoverCandidates'>, reason: string) {
    try {
      await markBad({ candidateId, reason })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark cover as bad')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between'>
          <span>Cover Candidates ({candidates.length})</span>
          {currentCoverUrl && (
            <Badge variant='outline' className='text-xs'>
              Current cover loaded
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && <div className='mb-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm'>{error}</div>}

        <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
          {candidates?.map((candidate: any) => {
            const isCurrentCover = currentCoverUrl && candidate.imageUrl === currentCoverUrl
            const isBad = !!candidate.badReason

            return (
              <div
                key={candidate._id}
                className={cn(
                  'relative border rounded-lg p-2 transition-all',
                  isCurrentCover && 'ring-2 ring-primary',
                  isBad && 'opacity-50',
                  !isBad && 'hover:border-primary cursor-pointer',
                )}
              >
                {/* Cover Image */}
                <div className='relative aspect-2/3 bg-muted rounded overflow-hidden mb-2'>
                  <Image
                    src={candidate.imageUrl}
                    alt='Cover candidate'
                    fill
                    className='object-cover'
                    sizes='(max-width: 768px) 50vw, 25vw'
                  />
                  {isCurrentCover && (
                    <div className='absolute inset-0 bg-primary/20 flex items-center justify-center'>
                      <Badge>Current</Badge>
                    </div>
                  )}
                  {isBad && (
                    <div className='absolute inset-0 bg-destructive/20 flex items-center justify-center'>
                      <Badge variant='destructive'>{candidate.badReason}</Badge>
                    </div>
                  )}
                </div>

                {/* Metadata */}
                <div className='text-xs text-muted-foreground space-y-1'>
                  {candidate.width && candidate.height && (
                    <div>
                      {candidate.width}×{candidate.height}px
                    </div>
                  )}
                  <div className='flex items-center gap-1'>
                    <Badge variant='secondary' className='text-[10px]'>
                      {candidate.source}
                    </Badge>
                    {candidate.isPrimary && (
                      <Badge variant='outline' className='text-[10px]'>
                        Primary
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className='mt-2 flex gap-1'>
                  {!isCurrentCover && !isBad && (
                    <Button
                      size='sm'
                      variant='default'
                      className='flex-1 text-xs'
                      onClick={() => handleSelect(candidate._id)}
                      disabled={isSelecting === candidate._id}
                    >
                      {isSelecting === candidate._id ? 'Selecting...' : 'Use This'}
                    </Button>
                  )}
                  {!isBad && (
                    <Button
                      size='sm'
                      variant='ghost'
                      className='text-xs px-2'
                      onClick={() => handleMarkBad(candidate._id, 'manual')}
                      title='Mark as bad'
                    >
                      ✕
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
