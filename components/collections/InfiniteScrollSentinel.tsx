'use client'

type InfiniteScrollSentinelProps = {
  elementRef: (element: HTMLDivElement | null) => void
}

export function InfiniteScrollSentinel({ elementRef }: InfiniteScrollSentinelProps) {
  return <div ref={elementRef} aria-hidden='true' className='h-px w-full' />
}
