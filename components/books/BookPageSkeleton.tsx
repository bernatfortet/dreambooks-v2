import { BookCoverSkeleton } from './BookCover'
import { BookDetailsSkeleton } from './BookDetails'

export function BookPageSkeleton() {
  return (
    <main className='w-full max-w-content mx-auto px-4 py-6'>
      <div className='h-4 w-24 bg-muted rounded animate-pulse mb-4' />

      <div className='flex flex-col md:flex-row gap-8'>
        <BookCoverSkeleton />
        <BookDetailsSkeleton />
      </div>
    </main>
  )
}
