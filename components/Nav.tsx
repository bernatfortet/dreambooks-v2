'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AuthButton } from '@/components/auth/AuthButton'
import { SearchBar } from '@/components/search/SearchBar'
import { Logo } from '@/components/core/Logo'

export function Nav() {
  const pathname = usePathname()

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/'
    }
    return pathname?.startsWith(path)
  }

  return (
    <nav className='sticky top-0 z-50 h-[52px] border-b bg-white'>
      <div className='container mx-auto h-full px-4'>
        <div className='flex h-full items-center gap-6'>
          <Link href='/' className='flex items-center'>
            <Logo className='h-[18px] w-auto' />
          </Link>

          <NavLink href='/' isActive={isActive('/')}>
            Books
          </NavLink>
          <NavLink href='/series' isActive={isActive('/series')}>
            Series
          </NavLink>
          <NavLink href='/authors' isActive={isActive('/authors')}>
            Authors
          </NavLink>
          <NavLink href='/awards' isActive={isActive('/awards')}>
            Awards
          </NavLink>

          <div className='flex-1'>
            <SearchBar />
          </div>

          <AuthButton />
        </div>
      </div>
    </nav>
  )
}

type NavLinkProps = {
  href: string
  isActive: boolean
  children: React.ReactNode
}

function NavLink({ href, isActive, children }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={`text-sm font-medium transition-colors ${
        isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </Link>
  )
}
