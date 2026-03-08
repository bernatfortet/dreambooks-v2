'use client'

import Link from 'next/link'

export function Nav() {
  return (
    <nav className='border-b bg-white'>
      <div className='container mx-auto flex h-[52px] items-center px-4'>
        <Link href='/' className='text-lg font-semibold'>
          Dreambooks
        </Link>
      </div>
    </nav>
  )
}
