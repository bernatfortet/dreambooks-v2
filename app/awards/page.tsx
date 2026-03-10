'use client'

import { AwardGrid } from '@/components/awards/AwardGrid'
import { PageContainer } from '@/components/ui/PageContainer'

export default function AwardsPage() {
  return (
    <PageContainer>
      <h1 className='text-3xl font-bold mb-6'>Awards</h1>

      <AwardGrid />
    </PageContainer>
  )
}
