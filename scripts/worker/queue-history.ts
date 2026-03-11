import { api } from '@/convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import { getConvexClient, getScrapeImportKey } from './convex'

const workerApi = api.worker

type RecentQueueItems = NonNullable<FunctionReturnType<typeof workerApi.listRecentQueueItems>>

export type QueueHistoryItem = RecentQueueItems[number]

export async function fetchRecentQueueItems(limit: number = 200): Promise<QueueHistoryItem[]> {
  const client = getConvexClient()
  const items = await client.query(workerApi.listRecentQueueItems, {
    apiKey: getScrapeImportKey(),
    limit,
  })
  return items as QueueHistoryItem[]
}
