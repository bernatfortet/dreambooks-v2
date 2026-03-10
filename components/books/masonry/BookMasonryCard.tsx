'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { BookCardBadge } from '@/components/books/BookCard'
import { DeleteDialog } from '@/components/admin/DeleteDialog'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import type { Id } from '@/convex/_generated/dataModel'

type BookMasonryCardProps = {
  bookId: Id<'books'>
  slug: string
  title: string
  authors: string[]
  coverUrl: string | null
  dominantColor?: string | null
  seriesPosition?: number | null
  badge?: ReactNode
  titleMarker?: ReactNode
  canManageBooks?: boolean
  style: React.CSSProperties
  imageHeight: number
  priority?: boolean
  onImageMeasure?: (dimensions: { width: number; height: number }) => void
}

export function BookMasonryCard({
  bookId,
  slug,
  title,
  authors,
  coverUrl,
  dominantColor,
  seriesPosition,
  badge,
  titleMarker,
  canManageBooks = false,
  style,
  imageHeight,
  priority = false,
  onImageMeasure,
}: BookMasonryCardProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const displayBadge = badge ?? (seriesPosition ? <BookCardBadge>#{seriesPosition}</BookCardBadge> : null)
  const bookLink = (
    <BookMasonryLink
      slug={slug}
      title={title}
      authors={authors}
      coverUrl={coverUrl}
      dominantColor={dominantColor}
      badge={displayBadge}
      titleMarker={titleMarker}
      style={style}
      imageHeight={imageHeight}
      priority={priority}
      isLoaded={isLoaded}
      onImageMeasure={onImageMeasure}
      onImageLoad={() => setIsLoaded(true)}
    />
  )

  if (!canManageBooks) return bookLink

  return (
    <>
      <BookDeleteContextMenu title={title} onDelete={() => setIsDeleteDialogOpen(true)}>
        {bookLink}
      </BookDeleteContextMenu>

      <DeleteDialog
        entityType='book'
        entityId={bookId}
        entityName={title}
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        redirectTo={null}
        showDefaultTrigger={false}
      />
    </>
  )
}

type BookMasonryLinkProps = {
  slug: string
  title: string
  authors: string[]
  coverUrl: string | null
  dominantColor?: string | null
  badge?: ReactNode
  titleMarker?: ReactNode
  style: React.CSSProperties
  imageHeight: number
  priority: boolean
  isLoaded: boolean
  onImageLoad: () => void
  onImageMeasure?: (dimensions: { width: number; height: number }) => void
}

function BookMasonryLink({
  slug,
  title,
  authors,
  coverUrl,
  dominantColor,
  badge,
  titleMarker,
  style,
  imageHeight,
  priority,
  isLoaded,
  onImageLoad,
  onImageMeasure,
}: BookMasonryLinkProps) {
  const imageSizes = getImageSizes(style)

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

              onImageLoad()

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

        {badge}
      </div>

      <h3 className='font-medium text-[14px] line-clamp-2 group-hover:text-primary transition-colors'>
        {titleMarker}
        {title}
      </h3>

      {authors.length > 0 ? <p className='text-[13px] text-muted-foreground line-clamp-1'>{authors.join(', ')}</p> : null}
    </Link>
  )
}

function BookDeleteContextMenu({
  children,
  title,
  onDelete,
}: {
  children: ReactNode
  title: string
  onDelete: () => void
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>{title}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem variant='destructive' onSelect={onDelete}>
          Delete book
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function getImageSizes(style: React.CSSProperties) {
  return typeof style.width === 'number' ? `${Math.round(style.width)}px` : style.width ?? '200px'
}
