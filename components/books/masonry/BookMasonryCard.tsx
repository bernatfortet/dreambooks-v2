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
}: BookMasonryCardProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const displayBadge = seriesPosition ? <BookCardBadge>#{seriesPosition}</BookCardBadge> : null

  return (
    <Link href={`/books/${slug}`} className='group block' style={style}>
      <div className='relative rounded-md overflow-hidden mb-2' style={{ height: imageHeight }}>
        <div
          className='absolute inset-0 bg-muted transition-opacity duration-300'
          style={{ ...(dominantColor ? { backgroundColor: dominantColor } : {}), opacity: isLoaded ? 0 : 0.25 }}
        />

        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={title}
            fill
            className={`object-cover group-hover:scale-105 transition-[transform,opacity] duration-300 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            sizes={`${Math.round((style.width as number) || 200)}px`}
            priority={priority}
            onLoadingComplete={() => setIsLoaded(true)}
          />
        ) : (
          <div className='w-full h-full flex items-center justify-center text-muted-foreground text-sm p-4 text-center'>
            {title}
          </div>
        )}

        {displayBadge}
      </div>

      <h3 className='font-medium text-base line-clamp-2 group-hover:text-primary transition-colors'>{title}</h3>

      {authors && authors.length > 0 && <p className='text-sm text-muted-foreground line-clamp-1'>{authors.join(', ')}</p>}
    </Link>
  )
}
