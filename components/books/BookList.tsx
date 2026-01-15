'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Doc } from '@/convex/_generated/dataModel'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function BookList() {
  const books = useQuery(api.books.queries.list) as Doc<'books'>[] | undefined

  if (books === undefined) {
    return <p className="text-muted-foreground">Loading books...</p>
  }

  if (books.length === 0) {
    return <p className="text-muted-foreground">No books yet. Add one above!</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Authors</TableHead>
          <TableHead>Scrape Status</TableHead>
          <TableHead>Cover Status</TableHead>
          <TableHead>Source</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {books.map((book) => (
          <TableRow key={book._id}>
            <TableCell>
              <Link href={`/ad/books/${book._id}`} className="hover:underline font-medium">
                {book.title}
              </Link>
            </TableCell>

            <TableCell>{book.authors.join(', ')}</TableCell>

            <TableCell>
              <StatusBadge status={book.scrapeStatus} />
            </TableCell>

            <TableCell>
              <StatusBadge status={book.coverStatus} />
            </TableCell>

            <TableCell className="text-muted-foreground">{book.source}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function StatusBadge({ status }: { status: 'pending' | 'complete' | 'error' }) {
  const variant = status === 'complete' ? 'default' : status === 'error' ? 'destructive' : 'secondary'

  return <Badge variant={variant}>{status}</Badge>
}
