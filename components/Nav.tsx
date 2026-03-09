import Link from 'next/link'

const navigationItems = [
  { href: '/', label: 'Books' },
  { href: '/series', label: 'Series' },
  { href: '/ad', label: 'Admin' },
]

export function Nav() {
  return (
    <header className='border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'>
      <div className='mx-auto flex h-[52px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8'>
        <Link href='/' className='font-semibold tracking-tight'>
          Dreambooks
        </Link>

        <nav className='flex items-center gap-1'>
          {navigationItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className='rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
