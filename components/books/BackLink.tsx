import Link from 'next/link'

export function BackLink() {
  return (
    <Link href='/' className='text-sm text-muted-foreground hover:underline block'>
      ← Back to books
    </Link>
  )
}
