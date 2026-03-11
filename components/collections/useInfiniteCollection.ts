'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type PaginatedQueryStatus = 'LoadingFirstPage' | 'LoadingMore' | 'CanLoadMore' | 'Exhausted'

type UseInfiniteCollectionProps = {
  enabled?: boolean
  loadMore: (numItems: number) => void
  pageSize: number
  rootMargin?: string
  status: PaginatedQueryStatus
}

export function useInfiniteCollection({
  enabled = true,
  loadMore,
  pageSize,
  rootMargin = '600px 0px',
  status,
}: UseInfiniteCollectionProps) {
  const [sentinelElement, setSentinelElement] = useState<HTMLDivElement | null>(null)
  const hasPendingLoadRef = useRef(false)

  const canLoadMore = enabled && status === 'CanLoadMore'
  const isLoadingFirstPage = status === 'LoadingFirstPage'
  const isLoadingMore = status === 'LoadingMore'

  const loadNextPage = useCallback(() => {
    if (!canLoadMore) return
    if (hasPendingLoadRef.current) return

    hasPendingLoadRef.current = true
    loadMore(pageSize)
  }, [canLoadMore, loadMore, pageSize])

  useEffect(() => {
    if (status === 'LoadingMore') return

    hasPendingLoadRef.current = false
  }, [status])

  useEffect(() => {
    if (!canLoadMore || !sentinelElement) return

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (!entry?.isIntersecting) return

        loadNextPage()
      },
      { rootMargin },
    )

    observer.observe(sentinelElement)

    return () => {
      observer.disconnect()
    }
  }, [canLoadMore, loadNextPage, rootMargin, sentinelElement])

  return {
    canLoadMore,
    isLoadingFirstPage,
    isLoadingMore,
    loadNextPage,
    sentinelRef: setSentinelElement,
  }
}
