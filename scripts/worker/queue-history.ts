import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { getConvexClient } from './convex'

export type QueueHistoryItem = {
  _id: Id<'scrapeQueue'>
  url: string
  status: 'pending' | 'processing' | 'complete' | 'error'
  referrerReason?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  errorMessage?: string
}

export async function fetchRecentQueueItems(limit: number = 200): Promise<QueueHistoryItem[]> {
  const client = getConvexClient()
  const items = await client.query(api.scrapeQueue.queries.list, { limit })
  return items as QueueHistoryItem[]
}
