import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'

type BookCardProps = {
  slug: string
  title: string
  authors?: string[]
  coverUrl: string | null
  seriesPosition?: number | null
  badge?: ReactNode
}

export function BookCard({ slug, title, authors, coverUrl, seriesPosition, badge }: BookCardProps) {
  const displayBadge = badge ?? (seriesPosition ? <BookCardBadge>#{seriesPosition}</BookCardBadge> : null)

  return (
    <Link href={`/books/${slug}`} className='group block'>
      <div className='aspect-2/3 relative bg-muted rounded-md overflow-hidden mb-2'>
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={title}
            fill
            className='object-cover group-hover:scale-105 transition-transform duration-200'
            sizes='(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw'
          />
        ) : (
          <div className='w-full h-full flex items-center justify-center text-muted-foreground text-sm p-4 text-center'>{title}</div>
        )}

        {displayBadge}
      </div>

      <h3 className='font-medium text-base line-clamp-2 group-hover:text-primary transition-colors'>{title}</h3>

      {authors && authors.length > 0 && <p className='text-sm text-muted-foreground line-clamp-1'>{authors.join(', ')}</p>}
    </Link>
  )
}

export function BookCardBadge({ children }: { children: ReactNode }) {
  return <div className='absolute top-2 left-2 bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded text-xs font-medium'>{children}</div>
}
