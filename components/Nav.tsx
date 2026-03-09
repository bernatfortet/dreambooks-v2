'use client'

import Link from 'next/link'

export function Nav() {
  return (
    <nav className='sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm'>
      <div className='mx-auto flex h-[52px] max-w-7xl items-center justify-between px-4'>
        <Link href='/' className='text-lg font-semibold'>
          Dreambooks
        </Link>
        <div className='flex items-center gap-4'>
          <Link href='/series' className='text-sm text-gray-600 hover:text-gray-900'>
            Series
          </Link>
          <Link href='/ad' className='text-sm text-gray-600 hover:text-gray-900'>
            Admin
          </Link>
        </div>
      </div>
    </nav>
  )
}
