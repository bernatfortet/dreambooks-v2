'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { X } from 'lucide-react'
import type { Id } from '@/convex/_generated/dataModel'

type QueueItem = {
  _id: Id<'scrapeQueue'>
  url: string
  type: string
  status: string
  createdAt: number
  displayName?: string
  displayImageUrl?: string
  errorMessage?: string
  referrerUrl?: string
  referrerReason?: string
  scrapeFullSeries?: boolean
}

export function QueueList() {
  const queueItems = useQuery(api.scrapeQueue.queries.list, { limit: 50 }) as QueueItem[] | undefined
  const removeItem = useMutation(api.scrapeQueue.mutations.remove)

  if (!queueItems) {
    return <div className='text-sm text-muted-foreground'>Loading queue...</div>
  }

  const pendingItems = queueItems.filter((item) => item.status === 'pending' || item.status === 'processing' || item.status === 'error')
  const completedItems = queueItems.filter((item) => item.status === 'complete')

  function handleRemove(queueId: Id<'scrapeQueue'>) {
    removeItem({ queueId })
  }

  return (
    <Tabs defaultValue='pending' className='w-full'>
      <TabsList className='grid w-full grid-cols-2'>
        <TabsTrigger value='pending'>Pending {pendingItems.length > 0 && `(${pendingItems.length})`}</TabsTrigger>
        <TabsTrigger value='completed'>Completed {completedItems.length > 0 && `(${completedItems.length})`}</TabsTrigger>
      </TabsList>

      <TabsContent value='pending' className='mt-4'>
        <QueueItemList items={pendingItems} onRemove={handleRemove} emptyMessage='No pending items' />
      </TabsContent>

      <TabsContent value='completed' className='mt-4'>
        <QueueItemList items={completedItems} onRemove={handleRemove} emptyMessage='No completed items' />
      </TabsContent>
    </Tabs>
  )
}

function QueueItemList({
  items,
  onRemove,
  emptyMessage,
}: {
  items: QueueItem[]
  onRemove: (id: Id<'scrapeQueue'>) => void
  emptyMessage: string
}) {
  if (items.length === 0) {
    return <div className='text-sm text-muted-foreground py-4 text-center'>{emptyMessage}</div>
  }

  return (
    <div className='space-y-2'>
      {items.map((item) => (
        <Card key={item._id} className='py-2'>
          <CardContent className='py-2 px-4'>
            <div className='flex items-center justify-between gap-4'>
              {item.displayImageUrl && <img src={item.displayImageUrl} alt='' className='w-10 h-14 object-cover rounded shrink-0' />}
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
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-6 w-6 text-muted-foreground hover:text-destructive'
                  onClick={() => onRemove(item._id)}
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>
            </div>
            {item.errorMessage && <p className='text-xs text-red-500 mt-2'>{item.errorMessage}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
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
