'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { BookCardBadge } from '@/components/books/BookCard'

type BookMasonryCardProps = {
  slug: string
  title: string
  authors: string[]
  coverUrl: string | null
  dominantColor?: string | null
  seriesPosition?: number | null
  style: React.CSSProperties
  imageHeight: number
  priority?: boolean
  onImageMeasure?: (dimensions: { width: number; height: number }) => void
}

export function BookMasonryCard({
  slug,
  title,
  authors,
  coverUrl,
  dominantColor,
  seriesPosition,
  style,
  imageHeight,
  priority = false,
  onImageMeasure,
}: BookMasonryCardProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const displayBadge = seriesPosition ? <BookCardBadge>#{seriesPosition}</BookCardBadge> : null
  const imageSizes = typeof style.width === 'number' ? `${Math.round(style.width)}px` : style.width ?? '200px'

  return (
    <Link href={`/books/${slug}`} className='group block' style={style}>
      <div className='relative rounded-md overflow-hidden mb-2 bg-muted' style={{ height: imageHeight }}>
        <div
          className='absolute inset-0 bg-muted transition-opacity duration-300'
          style={{ ...(dominantColor ? { backgroundColor: dominantColor } : {}), opacity: isLoaded ? 0 : 0.25 }}
        />

        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={title}
            fill
            className={`object-contain group-hover:scale-105 transition-[transform,opacity] duration-300 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            sizes={imageSizes}
            priority={priority}
            onLoadingComplete={(image) => {
              const naturalWidth = image.naturalWidth
              const naturalHeight = image.naturalHeight

              setIsLoaded(true)

              if (naturalWidth > 0 && naturalHeight > 0) {
                onImageMeasure?.({ width: naturalWidth, height: naturalHeight })
              }
            }}
          />
        ) : (
          <div className='w-full h-full flex items-center justify-center text-muted-foreground text-sm p-4 text-center'>
            {title}
          </div>
        )}

        {displayBadge}
      </div>

      <h3 className='font-medium text-[14px] line-clamp-2 group-hover:text-primary transition-colors'>{title}</h3>

      {authors && authors.length > 0 && <p className='text-[13px] text-muted-foreground line-clamp-1'>{authors.join(', ')}</p>}
    </Link>
  )
}
