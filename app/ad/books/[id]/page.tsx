import Link from 'next/link'
import { BookCard } from '@/components/books/BookCard'
import { Id } from '@/convex/_generated/dataModel'

export const dynamic = 'force-dynamic'

type AdminBookPageProps = {
  params: Promise<{ id: string }>
}

export default async function AdminBookPage({ params }: AdminBookPageProps) {
  const { id } = await params

  return (
    <main className="container mx-auto py-8 px-4">
      <Link href="/ad" className="text-sm text-muted-foreground hover:underline mb-4 block">
        ← Back to admin
      </Link>

      <BookCard bookId={id as Id<'books'>} />
    </main>
  )
}
