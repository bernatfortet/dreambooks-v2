import { BookSubmitForm } from '@/components/books/BookSubmitForm'
import { BookList } from '@/components/books/BookList'

export const dynamic = 'force-dynamic'

export default function AdminPage() {
  return (
    <main className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Dreambooks Admin</h1>
      <p className="text-muted-foreground mb-8">Manage books and series</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Add a Book</h2>
        <BookSubmitForm />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Books</h2>
        <BookList />
      </section>
    </main>
  )
}
