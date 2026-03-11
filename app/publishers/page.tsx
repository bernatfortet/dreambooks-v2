import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import { PublisherList } from '@/components/publishers/PublisherList'
import { PageContainer } from '@/components/ui/PageContainer'

export const revalidate = 3600

export default async function PublishersPage() {
  const publishers = await fetchQuery(api.publishers.queries.listWithTopBooks, {})

  return (
    <PageContainer>
      <h1 className='text-3xl font-bold mb-6'>Publishers</h1>

      <PublisherList publishers={publishers} />
    </PageContainer>
  )
}
