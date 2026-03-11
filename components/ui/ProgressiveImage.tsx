'use client'

import type { CSSProperties } from 'react'
import type { SyntheticEvent } from 'react'
import { useState } from 'react'
import { getNaturalImageDimensions, type ImageDimensions } from '@/lib/image-dimensions'
import { cn } from '@/lib/utils'

type ProgressiveImageProps = {
  lowResSrc: string
  highResSrc: string
  alt: string
  className?: string
  priority?: boolean
  onDimensionsResolved?: (dimensions: ImageDimensions) => void
  imageStyle?: CSSProperties
}

export function ProgressiveImage({ lowResSrc, highResSrc, alt, className, priority, onDimensionsResolved, imageStyle }: ProgressiveImageProps) {
  const [highResLoaded, setHighResLoaded] = useState(false)
  const lowResImageLoadingProps = getLowResImageLoadingProps(priority)
  const highResImageLoadingProps = getHighResImageLoadingProps(priority)

  return (
    <div className={cn('inline-grid max-w-full', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={lowResSrc}
        alt=''
        aria-hidden='true'
        className='col-start-1 row-start-1 block h-auto w-auto max-w-full rounded-lg shadow-lg'
        decoding='async'
        {...lowResImageLoadingProps}
        onLoad={handleLowResLoad}
        style={imageStyle}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={highResSrc}
        alt={alt}
        className={cn(
          'col-start-1 row-start-1 h-auto w-auto max-w-full rounded-lg shadow-lg transition-opacity duration-300',
          highResLoaded ? 'opacity-100' : 'opacity-0',
        )}
        decoding='async'
        {...highResImageLoadingProps}
        onLoad={handleHighResLoad}
        style={imageStyle}
      />
    </div>
  )

  function handleLowResLoad(event: SyntheticEvent<HTMLImageElement>) {
    resolveImageDimensions(event)
  }

  function handleHighResLoad(event: SyntheticEvent<HTMLImageElement>) {
    setHighResLoaded(true)
    resolveImageDimensions(event)
  }

  function resolveImageDimensions(event: SyntheticEvent<HTMLImageElement>) {
    const dimensions = getNaturalImageDimensions(event.currentTarget)
    if (!dimensions) return

    onDimensionsResolved?.(dimensions)
  }
}

function getLowResImageLoadingProps(priority: boolean | undefined) {
  return {
    fetchPriority: 'auto',
    loading: priority ? 'eager' : 'lazy',
  } as const
}

function getHighResImageLoadingProps(priority: boolean | undefined) {
  return {
    fetchPriority: priority ? 'high' : 'auto',
    loading: priority ? 'eager' : 'lazy',
  } as const
}
