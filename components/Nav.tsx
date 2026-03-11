'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MenuIcon } from 'lucide-react'
import { AuthButton } from '@/components/auth/AuthButton'
import { SearchBar } from '@/components/search/SearchBar'
import { Logo } from '@/components/core/Logo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

const NAV_ITEMS = [
  { href: '/', label: 'Books' },
  { href: '/series', label: 'Series' },
  { href: '/authors', label: 'Authors' },
  { href: '/awards', label: 'Awards' },
]

export function Nav() {
  const pathname = usePathname()
  const isActive = (path: string) => isPathActive(pathname, path)

  return (
    <nav className='sticky top-0 z-50 h-[52px] border-b bg-white'>
      <div className='container mx-auto h-full px-4'>
        <DesktopNav isActive={isActive} />
        <MobileNav isActive={isActive} />
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

function DesktopNav({ isActive }: { isActive: (path: string) => boolean }) {
  return (
    <div className='hidden h-full items-center gap-6 md:flex'>
      <Link href='/' className='flex items-center'>
        <Logo className='h-[18px] w-auto' />
      </Link>

      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} href={item.href} isActive={isActive(item.href)}>
          {item.label}
        </NavLink>
      ))}

      <div className='min-w-0 flex-1'>
        <SearchBar />
      </div>

      <AuthButton />
    </div>
  )
}

function MobileNav({ isActive }: { isActive: (path: string) => boolean }) {
  return (
    <div className='flex h-full items-center justify-between md:hidden'>
      <Link href='/' className='flex items-center'>
        <Logo className='h-4 w-auto' />
      </Link>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant='ghost' size='icon-sm' aria-label='Open navigation menu'>
            <MenuIcon className='size-4' />
          </Button>
        </SheetTrigger>

        <SheetContent side='right' className='w-[85vw] max-w-sm'>
          <SheetHeader className='text-left'>
            <SheetTitle>Browse DreamBooks</SheetTitle>
            <SheetDescription className='sr-only'>Open search, navigation links, and account actions.</SheetDescription>
          </SheetHeader>

          <div className='mt-6 space-y-6'>
            <SearchBar />

            <div className='space-y-2'>
              {NAV_ITEMS.map((item) => (
                <SheetClose key={item.href} asChild>
                  <Link href={item.href} className={getMobileNavLinkClassName(isActive(item.href))}>
                    {item.label}
                  </Link>
                </SheetClose>
              ))}
            </div>

            <AuthButton />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function isPathActive(pathname: string | null, path: string) {
  if (path === '/') return pathname === '/'

  return pathname?.startsWith(path) ?? false
}

function getMobileNavLinkClassName(isActive: boolean) {
  return `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-accent text-primary' : 'text-foreground hover:bg-accent'
  }`
}
