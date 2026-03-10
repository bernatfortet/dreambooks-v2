'use client'

import { PublisherList } from '@/components/publishers/PublisherList'
import { PageContainer } from '@/components/ui/PageContainer'

export default function PublishersPage() {
  return (
    <PageContainer>
      <h1 className='text-3xl font-bold mb-6'>Publishers</h1>

      <PublisherList />
    </PageContainer>
  )
}
