'use client'

import Image from 'next/image'
import { ProgressiveImage } from '@/components/ui/ProgressiveImage'
import { api } from '@/convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'

const NAV_HEIGHT = 52
const COVER_HEIGHT = `calc(100vh - ${NAV_HEIGHT}px - 80px)`
const LANDSCAPE_THRESHOLD = 1.05

type Book = NonNullable<FunctionReturnType<typeof api.books.queries.getBySlugOrId>>

type BookCoverProps = {
  book: Book
}

export function isLandscapeCover(width?: number, height?: number): boolean {
  if (!width || !height || width <= 0 || height <= 0) return false
  return width / height > LANDSCAPE_THRESHOLD
}

export function BookCover({ book }: BookCoverProps) {
  const title = book.title
  const coverUrl = book.cover?.url ?? null
  const coverUrlFull = book.cover?.urlFull ?? null
  const coverWidth = book.cover?.width
  const coverHeight = book.cover?.height

  const isLandscape = isLandscapeCover(coverWidth, coverHeight)
  const coverAspectRatio = getCoverAspectRatio(coverWidth, coverHeight)
  const coverStyle = getCoverStyle(coverAspectRatio, isLandscape)

  // Landscape covers get full width, portrait covers get side-by-side layout
  const containerClass = isLandscape
    ? 'shrink-0 w-full max-w-[800px]'
    : 'shrink-0 w-full max-w-[80vw] md:max-w-[600px] md:w-auto self-start'

  return (
    <div className={containerClass} style={coverStyle}>
      <BookCoverImage coverUrl={coverUrl} coverUrlFull={coverUrlFull} title={title} />
    </div>
  )
}

export function BookCoverSkeleton() {
  const coverStyle = getCoverStyle(2 / 3, false)

  return (
    <div className='shrink-0 w-full max-w-[80vw] md:max-w-[600px] md:w-auto self-start' style={coverStyle}>
      <div className='bg-muted rounded-lg animate-pulse w-full h-full' />
    </div>
  )
}

function BookCoverImage({ coverUrl, coverUrlFull, title }: { coverUrl?: string | null; coverUrlFull?: string | null; title: string }) {
  if (coverUrlFull && coverUrl) {
    return (
      <div className='relative overflow-hidden rounded-lg shadow-lg w-full h-full'>
        <ProgressiveImage
          lowResSrc={coverUrl}
          highResSrc={coverUrlFull}
          alt={title}
          className='w-full h-full'
          sizes='(max-width: 768px) 80vw, 600px'
          priority
        />
      </div>
    )
  }

  if (coverUrl) {
    return (
      <div className='relative overflow-hidden rounded-lg shadow-lg w-full h-full'>
        <Image src={coverUrl} alt={title} fill className='object-contain' sizes='(max-width: 768px) 80vw, 600px' priority />
      </div>
    )
  }

  return (
    <div className='bg-muted rounded-lg flex items-center justify-center w-full h-full'>
      <span className='text-muted-foreground text-center p-4'>{title}</span>
    </div>
  )
}

type CoverStyle = {
  width: string
  height: string
  maxWidth: string
  maxHeight: string
  aspectRatio: string
}

/**
 * Returns the aspect ratio for a book cover.
 *
 * IMPORTANT: Always use the actual stored dimensions. Never force landscape
 * covers into portrait ratios - this causes visual distortion. The layout
 * in BookPage adapts based on isLandscapeCover() to handle both orientations.
 */
function getCoverAspectRatio(coverWidth?: number, coverHeight?: number): number {
  if (!coverWidth || !coverHeight) return 2 / 3
  if (coverWidth <= 0 || coverHeight <= 0) return 2 / 3

  return coverWidth / coverHeight
}

function getCoverStyle(coverAspectRatio: number, isLandscape: boolean): CoverStyle {
  return {
    width: '100%',
    height: 'auto',
    maxWidth: isLandscape ? '800px' : '600px',
    maxHeight: isLandscape ? '500px' : COVER_HEIGHT,
    aspectRatio: String(coverAspectRatio),
  }
}
