import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import { AwardGrid } from '@/components/awards/AwardGrid'
import { PageContainer } from '@/components/ui/PageContainer'

export const revalidate = 3600

export default async function AwardsPage() {
  const awards = await fetchQuery(api.awards.queries.list, {})

  return (
    <PageContainer>
      <h1 className='text-3xl font-bold mb-6'>Awards</h1>

      <AwardGrid awards={awards} />
    </PageContainer>
  )
}
