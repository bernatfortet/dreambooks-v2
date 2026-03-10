'use client'

import { AuthorList } from '@/components/authors/AuthorList'
import { PageContainer } from '@/components/ui/PageContainer'

export default function AuthorsPage() {
  return (
    <PageContainer>
      <h1 className='text-3xl font-bold mb-6'>Authors</h1>

      <AuthorList />
    </PageContainer>
  )
}
