import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Recover queue items with expired leases every 5 minutes
crons.interval(
  'recover expired leases',
  { minutes: 5 },
  internal.scrapeQueue.mutations.recoverExpiredLeases
)

export default crons
