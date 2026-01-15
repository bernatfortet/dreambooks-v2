import { BookGrid } from '@/components/books/BookGrid'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  return (
    <main className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Dreambooks</h1>
      <p className="text-muted-foreground mb-8">
        Discover and explore children&apos;s books
      </p>

      <BookGrid />
    </main>
  )
}
