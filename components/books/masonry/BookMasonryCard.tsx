'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { BookProfileActions } from '@/components/books/BookProfileActions'
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
  showProfileActions?: boolean
  style: React.CSSProperties
  imageHeight: number
  imageAspectRatio?: number
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
  showProfileActions = false,
  style,
  imageHeight,
  imageAspectRatio,
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
      bookId={bookId}
      showProfileActions={showProfileActions}
      style={style}
      imageHeight={imageHeight}
      imageAspectRatio={imageAspectRatio}
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
  bookId: Id<'books'>
  showProfileActions: boolean
  style: React.CSSProperties
  imageHeight: number
  imageAspectRatio?: number
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
  bookId,
  showProfileActions,
  style,
  imageHeight,
  imageAspectRatio,
  priority,
  isLoaded,
  onImageLoad,
  onImageMeasure,
}: BookMasonryLinkProps) {
  const imageSizes = getImageSizes(style)

  return (
    <div className='group block' style={style}>
      <div className='relative rounded-md overflow-hidden mb-2 bg-muted' style={getImageContainerStyle({ imageHeight, imageAspectRatio })}>
        <Link href={`/books/${slug}`} className='block h-full w-full'>
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
        </Link>

        {showProfileActions ? <BookProfileActions bookId={bookId} layout='card-overlay' /> : null}
      </div>

      <Link href={`/books/${slug}`} className='block'>
        <h3 className='font-medium text-[14px] line-clamp-2 group-hover:text-primary transition-colors'>
          {titleMarker}
          {title}
        </h3>

        {authors.length > 0 ? <p className='text-[13px] text-muted-foreground line-clamp-1'>{authors.join(', ')}</p> : null}
      </Link>
    </div>
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
  if (typeof style.width === 'number') {
    return `${Math.round(style.width)}px`
  }

  return '(max-width: 640px) 50vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 16vw'
}

function getImageContainerStyle({
  imageHeight,
  imageAspectRatio,
}: {
  imageHeight: number
  imageAspectRatio?: number
}): React.CSSProperties {
  if (imageAspectRatio && imageAspectRatio > 0) {
    return { aspectRatio: `${imageAspectRatio}` }
  }

  return { height: imageHeight }
}
