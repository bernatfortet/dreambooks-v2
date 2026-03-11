'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { InfiniteScrollSentinel } from './InfiniteScrollSentinel'
import { useInfiniteCollection, type PaginatedQueryStatus } from './useInfiniteCollection'

type PaginatedCollectionSectionProps<TItem> = {
  emptyState: ReactNode
  items: TItem[]
  loadMore: (numItems: number) => void
  loadingFallback: ReactNode
  loadingMoreLabel?: ReactNode
  manualLoadLabel?: string
  pageSize: number
  renderItems: (items: TItem[]) => ReactNode
  rootMargin?: string
  status: PaginatedQueryStatus
}

export function PaginatedCollectionSection<TItem>({
  emptyState,
  items,
  loadMore,
  loadingFallback,
  loadingMoreLabel = <p className='text-muted-foreground'>Loading...</p>,
  manualLoadLabel = 'Load more',
  pageSize,
  renderItems,
  rootMargin,
  status,
}: PaginatedCollectionSectionProps<TItem>) {
  const { canLoadMore, isLoadingFirstPage, isLoadingMore, loadNextPage, sentinelRef } = useInfiniteCollection({
    loadMore,
    pageSize,
    rootMargin,
    status,
  })
  const showPaginationControls = canLoadMore || isLoadingMore

  if (isLoadingFirstPage) {
    return loadingFallback
  }

  if (items.length === 0) {
    return emptyState
  }

  return (
    <div className='space-y-8'>
      {renderItems(items)}

      {showPaginationControls ? (
        <div className='flex flex-col items-center gap-3'>
          {canLoadMore ? <InfiniteScrollSentinel elementRef={sentinelRef} /> : null}
          {isLoadingMore ? loadingMoreLabel : null}
          {canLoadMore ? (
            <Button variant='ghost' size='sm' onClick={loadNextPage}>
              {manualLoadLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
