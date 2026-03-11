'use client'

import { useState } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { useQuery, useMutation } from 'convex/react'
import Image from 'next/image'
import { api } from '@/convex/_generated/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { X } from 'lucide-react'
import type { Id } from '@/convex/_generated/dataModel'

type QueueItem = NonNullable<FunctionReturnType<typeof api.scrapeQueue.queries.list>>[number]

export function QueueList() {
  const queueItems = useQuery(api.scrapeQueue.queries.list, { limit: 50 })
  const removeItem = useMutation(api.scrapeQueue.mutations.remove)
  const retryFailedItem = useMutation(api.scrapeQueue.mutations.retryFailed)

  if (!queueItems) {
    return <div className='text-sm text-muted-foreground'>Loading queue...</div>
  }

  const pendingItems = queueItems.filter(isOpenQueueItem)
  const completedItems = queueItems.filter((item) => item.status === 'complete')

  async function handleRemove(queueId: Id<'scrapeQueue'>) {
    await removeItem({ queueId })
  }

  async function handleRetry(queueId: Id<'scrapeQueue'>) {
    await retryFailedItem({ queueId })
  }

  return (
    <Tabs defaultValue='pending' className='w-full'>
      <TabsList className='grid w-full grid-cols-2'>
        <TabsTrigger value='pending'>Pending {pendingItems.length > 0 && `(${pendingItems.length})`}</TabsTrigger>
        <TabsTrigger value='completed'>Completed {completedItems.length > 0 && `(${completedItems.length})`}</TabsTrigger>
      </TabsList>

      <TabsContent value='pending' className='mt-4'>
        <QueueItemList items={pendingItems} onRemove={handleRemove} onRetry={handleRetry} emptyMessage='No pending items' />
      </TabsContent>

      <TabsContent value='completed' className='mt-4'>
        <QueueItemList items={completedItems} onRemove={handleRemove} onRetry={handleRetry} emptyMessage='No completed items' />
      </TabsContent>
    </Tabs>
  )
}

function QueueItemList({
  items,
  onRemove,
  onRetry,
  emptyMessage,
}: {
  items: QueueItem[]
  onRemove: (id: Id<'scrapeQueue'>) => Promise<void>
  onRetry: (id: Id<'scrapeQueue'>) => Promise<void>
  emptyMessage: string
}) {
  if (items.length === 0) {
    return <div className='text-sm text-muted-foreground py-4 text-center'>{emptyMessage}</div>
  }

  return (
    <div className='space-y-2'>
      {items.map((item) => (
        <QueueItemCard key={item._id} item={item} onRemove={onRemove} onRetry={onRetry} />
      ))}
    </div>
  )
}

function QueueItemCard({
  item,
  onRemove,
  onRetry,
}: {
  item: QueueItem
  onRemove: (id: Id<'scrapeQueue'>) => Promise<void>
  onRetry: (id: Id<'scrapeQueue'>) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleRemove() {
    await runQueueAction({
      action: () => onRemove(item._id),
      setActionError,
      setIsSubmitting,
    })
  }

  async function handleRetry() {
    await runQueueAction({
      action: () => onRetry(item._id),
      setActionError,
      setIsSubmitting,
    })
  }

  return (
    <Card className='py-2'>
      <CardContent className='py-2 px-4'>
        <div className='flex items-center justify-between gap-4'>
          {item.displayImageUrl && (
            <Image
              src={item.displayImageUrl}
              alt=''
              width={40}
              height={56}
              className='w-10 h-14 object-cover rounded shrink-0'
            />
          )}
          <div className='flex-1 min-w-0'>
            <div className='flex items-center gap-2 mb-1'>
              <Badge variant='outline' className='text-xs'>
                {item.type}
              </Badge>
              <StatusBadge status={item.status} />
              {item.scrapeFullSeries && (
                <Badge variant='secondary' className='text-xs'>
                  +series
                </Badge>
              )}
            </div>
            {item.displayName && (
              <p className='text-sm font-medium truncate' title={item.displayName}>
                {item.displayName}
              </p>
            )}
            <a
              href={item.url}
              target='_blank'
              rel='noopener noreferrer'
              className='text-xs text-muted-foreground truncate hover:text-primary hover:underline block'
              title={item.url}
            >
              {item.url}
            </a>
            {item.referrerUrl && (
              <div className='text-xs text-muted-foreground/70 mt-1'>
                From:{' '}
                <a
                  href={item.referrerUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='hover:text-primary hover:underline'
                  title={item.referrerUrl}
                >
                  {truncateUrl(item.referrerUrl)}
                </a>
                {item.referrerReason && <span className='ml-1 text-muted-foreground/60'>({item.referrerReason})</span>}
              </div>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <div className='text-xs text-muted-foreground whitespace-nowrap'>{formatRelativeTime(item.createdAt)}</div>
            {item.status === 'error' && (
              <Button variant='outline' size='sm' onClick={handleRetry} disabled={isSubmitting}>
                Retry
              </Button>
            )}
            <Button
              variant='ghost'
              size='icon'
              className='h-6 w-6 text-muted-foreground hover:text-destructive'
              onClick={handleRemove}
              disabled={isSubmitting}
            >
              <X className='h-4 w-4' />
            </Button>
          </div>
        </div>
        {item.errorMessage && <p className='text-xs text-red-500 mt-2'>{item.errorMessage}</p>}
        {actionError && <p className='text-xs text-red-500 mt-2'>{actionError}</p>}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: QueueItem['status'] }) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant='secondary' className='text-xs'>
          ⏳ Pending
        </Badge>
      )
    case 'processing':
      return (
        <Badge variant='default' className='text-xs'>
          🔄 Processing
        </Badge>
      )
    case 'complete':
      return (
        <Badge variant='outline' className='text-xs text-green-600'>
          ✅ Complete
        </Badge>
      )
    case 'error':
      return (
        <Badge variant='destructive' className='text-xs'>
          ❌ Error
        </Badge>
      )
    default:
      return (
        <Badge variant='outline' className='text-xs'>
          {status}
        </Badge>
      )
  }
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function truncateUrl(url: string, maxLength: number = 50): string {
  if (url.length <= maxLength) return url
  return url.substring(0, maxLength) + '...'
}

function isOpenQueueItem(item: QueueItem) {
  return item.status === 'pending' || item.status === 'processing' || item.status === 'error'
}

async function runQueueAction(params: {
  action: () => Promise<void>
  setActionError: (value: string | null) => void
  setIsSubmitting: (value: boolean) => void
}) {
  params.setIsSubmitting(true)
  params.setActionError(null)

  try {
    await params.action()
  } catch (error) {
    params.setActionError(error instanceof Error ? error.message : 'Queue action failed')
  } finally {
    params.setIsSubmitting(false)
  }
}
