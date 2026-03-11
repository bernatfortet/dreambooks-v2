'use client'

import type { SyntheticEvent } from 'react'
import { useState } from 'react'
import { ProgressiveImage } from '@/components/ui/ProgressiveImage'
import { api } from '@/convex/_generated/api'
import { getBookCoverKey } from '@/lib/book-cover'
import { getNaturalImageDimensions, type ImageDimensions } from '@/lib/image-dimensions'
import type { FunctionReturnType } from 'convex/server'

const NAV_HEIGHT = 52
const COVER_HEIGHT = `calc(100vh - ${NAV_HEIGHT}px - 80px)`
const LANDSCAPE_MAX_HEIGHT = '500px'
const LANDSCAPE_THRESHOLD = 1.05

type Book = NonNullable<FunctionReturnType<typeof api.books.queries.getBySlugOrId>>

type BookCoverProps = {
  book: Book
  onLandscapeChange?: (isLandscape: boolean) => void
}

type MeasuredCover = {
  coverKey: string
  dimensions: ImageDimensions
}

export function isLandscapeCover(width?: number, height?: number): boolean {
  if (!width || !height || width <= 0 || height <= 0) return false
  return width / height > LANDSCAPE_THRESHOLD
}

export function BookCover({ book, onLandscapeChange }: BookCoverProps) {
  const title = book.title
  const coverUrl = book.cover?.url ?? null
  const coverUrlFull = book.cover?.urlFull ?? null
  const coverKey = getBookCoverKey(book)
  const [measuredCover, setMeasuredCover] = useState<MeasuredCover | null>(null)
  const measuredDimensions = measuredCover?.coverKey === coverKey ? measuredCover.dimensions : null
  const coverDimensions = getResolvedCoverDimensions(measuredDimensions, book.cover)
  const isLandscape = isLandscapeCover(coverDimensions.width, coverDimensions.height)
  const maxHeight = getCoverMaxHeight(isLandscape)
  const containerClass = getCoverContainerClass(isLandscape)

  return (
    <div className={containerClass}>
      <BookCoverImage
        coverUrl={coverUrl}
        coverUrlFull={coverUrlFull}
        title={title}
        maxHeight={maxHeight}
        onDimensionsResolved={handleDimensionsResolved}
      />
    </div>
  )

  function handleDimensionsResolved(dimensions: ImageDimensions) {
    if (measuredCover?.coverKey === coverKey && areDimensionsEqual(measuredCover.dimensions, dimensions)) return

    setMeasuredCover({ coverKey, dimensions })
    onLandscapeChange?.(isLandscapeCover(dimensions.width, dimensions.height))
  }
}

export function BookCoverSkeleton() {
  return (
    <div className='shrink-0 w-full md:w-fit max-w-[80vw] md:max-w-[600px] self-start'>
      <div className='bg-muted rounded-lg animate-pulse aspect-2/3 w-full' style={{ maxHeight: COVER_HEIGHT }} />
    </div>
  )
}

function BookCoverImage({
  coverUrl,
  coverUrlFull,
  title,
  maxHeight,
  onDimensionsResolved,
}: {
  coverUrl?: string | null
  coverUrlFull?: string | null
  title: string
  maxHeight: string
  onDimensionsResolved: (dimensions: ImageDimensions) => void
}) {
  const imageStyle = { maxHeight }

  if (coverUrlFull && coverUrl) {
    return (
      <div className='max-w-full'>
        <ProgressiveImage
          lowResSrc={coverUrl}
          highResSrc={coverUrlFull}
          alt={title}
          className='max-w-full'
          imageStyle={imageStyle}
          onDimensionsResolved={onDimensionsResolved}
          priority
        />
      </div>
    )
  }

  if (coverUrl) {
    return (
      <div className='max-w-full'>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverUrl}
          alt={title}
          className='block h-auto w-auto max-w-full rounded-lg shadow-lg'
          decoding='async'
          fetchPriority='high'
          loading='eager'
          onLoad={handleImageLoad}
          style={imageStyle}
        />
      </div>
    )
  }

  return (
    <div className='bg-muted rounded-lg flex items-center justify-center aspect-2/3 w-full' style={imageStyle}>
      <span className='text-muted-foreground text-center p-4'>{title}</span>
    </div>
  )

  function handleImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const dimensions = getNaturalImageDimensions(event.currentTarget)
    if (!dimensions) return

    onDimensionsResolved(dimensions)
  }
}

function areDimensionsEqual(current: ImageDimensions | null, next: ImageDimensions): boolean {
  if (!current) return false

  return current.width === next.width && current.height === next.height
}

function getResolvedCoverDimensions(
  loadedCoverDimensions: ImageDimensions | null,
  cover: { width?: number; height?: number } | null | undefined,
): ImageDimensions {
  return {
    width: loadedCoverDimensions?.width ?? cover?.width ?? 0,
    height: loadedCoverDimensions?.height ?? cover?.height ?? 0,
  }
}

function getCoverMaxHeight(isLandscape: boolean): string {
  if (isLandscape) return LANDSCAPE_MAX_HEIGHT

  return COVER_HEIGHT
}

function getCoverContainerClass(isLandscape: boolean): string {
  if (isLandscape) return 'shrink-0 w-full md:w-fit max-w-[800px] self-start'

  return 'shrink-0 w-full md:w-fit max-w-[80vw] md:max-w-[600px] self-start'
}
