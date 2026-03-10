'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Search, Book, Users, Library } from 'lucide-react'

type RecentSearch = {
  type: 'book' | 'series' | 'author'
  name: string
  slug: string | null
  id: string
}

const RECENT_SEARCHES_KEY = 'dreambooks-recent-searches'
const MAX_RECENT_SEARCHES = 5

const TYPE_TO_ROUTE: Record<RecentSearch['type'], 'books' | 'series' | 'authors'> = {
  book: 'books',
  series: 'series',
  author: 'authors',
}

const TYPE_TO_ICON: Record<RecentSearch['type'], typeof Book> = {
  book: Book,
  series: Library,
  author: Users,
}

export function SearchBar() {
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(loadRecentSearches)
  const debouncedQuery = useDebounce(query, 200)
  const debouncedQueryText = debouncedQuery.trim()
  const results = useQuery(api.search.queries.global, { query: debouncedQuery })
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Derive isOpen from focus state and content availability
  const hasQuery = query.trim().length > 0
  const hasRecent = recentSearches.length > 0
  const isOpen = isFocused && (hasQuery || hasRecent)

  // Save recent search to localStorage
  const addRecentSearch = (search: RecentSearch) => {
    try {
      const updated = [search, ...recentSearches.filter((s) => s.id !== search.id || s.type !== search.type)]
      const limited = updated.slice(0, MAX_RECENT_SEARCHES)
      setRecentSearches(limited)
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(limited))
    } catch {
      // Ignore localStorage errors
    }
  }

  // Keyboard shortcuts: Cmd+K to focus, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        const target = e.target as HTMLElement
        const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
        if (!isEditable) {
          e.preventDefault()
          inputRef.current?.focus()
        }
      }

      if (e.key === 'Escape' && isOpen) {
        setIsFocused(false)
        inputRef.current?.blur()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const navigate = (path: string, recentSearch?: RecentSearch) => {
    setIsFocused(false)
    setQuery('')
    if (recentSearch) {
      addRecentSearch(recentSearch)
    }
    router.push(path)
  }

  return (
    <div ref={containerRef} className='relative w-full'>
      <div className='relative'>
        <div className='flex items-center border border-input bg-background rounded-md h-9 px-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2'>
          <Search className='h-4 w-4 shrink-0 text-muted-foreground mr-2' />
          <input
            ref={inputRef}
            type='text'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              // Delay to allow click on dropdown items
              setTimeout(() => setIsFocused(false), 200)
            }}
            placeholder='Search books, series, authors...'
            className='flex h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground'
          />
          <kbd className='pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex'>
            <span className='text-xs'>⌘</span>K
          </kbd>
        </div>
      </div>

      {isOpen && (
        <div className='absolute top-full left-0 right-0 mt-1 z-50 rounded-md border bg-popover text-popover-foreground shadow-md'>
          <Command shouldFilter={false} className='rounded-md'>
            <CommandList>
              {!debouncedQueryText && recentSearches.length > 0 && (
                <CommandGroup heading='Recent'>
                  {recentSearches.map((recent) => {
                    const Icon = TYPE_TO_ICON[recent.type]
                    return (
                      <CommandItem
                        key={`${recent.type}-${recent.id}`}
                        value={recent.name}
                        onSelect={() => navigate(getPath(TYPE_TO_ROUTE[recent.type], recent.slug, recent.id), recent)}
                      >
                        <Icon className='mr-2 h-4 w-4' />
                        {recent.name}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}

              {debouncedQueryText && (
                <>
                  {results?.exactMatch ? (
                    <CommandGroup>
                      <CommandItem
                        value='exact-match'
                        onSelect={() => {
                          const exact = results.exactMatch
                          if (!exact) return
                          const name = 'title' in exact ? exact.title : exact.name
                          const recentSearch: RecentSearch = { type: exact.type, name, slug: exact.slug, id: exact.id }
                          navigate(getExactMatchPath(exact), recentSearch)
                        }}
                      >
                        Go to {results.exactMatch.type}:{' '}
                        {'title' in results.exactMatch ? results.exactMatch.title : results.exactMatch.name}
                      </CommandItem>
                    </CommandGroup>
                  ) : (
                    !results?.books?.length &&
                    !results?.series?.length &&
                    !results?.authors?.length && <CommandEmpty>No results found.</CommandEmpty>
                  )}

                  {results?.books && results.books.length > 0 && (
                    <CommandGroup heading='Books'>
                      {results.books.map((book) => (
                        <CommandItem
                          key={book._id}
                          value={book.title}
                          onSelect={() =>
                            navigate(getPath('books', book.slug, book._id), {
                              type: 'book',
                              name: book.title,
                              slug: book.slug,
                              id: book._id,
                            })
                          }
                        >
                          <Book className='mr-2 h-4 w-4' />
                          {book.title}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {results?.series && results.series.length > 0 && (
                    <CommandGroup heading='Series'>
                      {results.series.map((s) => (
                        <CommandItem
                          key={s._id}
                          value={s.name}
                          onSelect={() =>
                            navigate(getPath('series', s.slug, s._id), {
                              type: 'series',
                              name: s.name,
                              slug: s.slug,
                              id: s._id,
                            })
                          }
                        >
                          <Library className='mr-2 h-4 w-4' />
                          {s.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {results?.authors && results.authors.length > 0 && (
                    <CommandGroup heading='Authors'>
                      {results.authors.map((author) => (
                        <CommandItem
                          key={author._id}
                          value={author.name}
                          onSelect={() =>
                            navigate(getPath('authors', author.slug, author._id), {
                              type: 'author',
                              name: author.name,
                              slug: author.slug,
                              id: author._id,
                            })
                          }
                        >
                          <Users className='mr-2 h-4 w-4' />
                          {author.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {!results?.exactMatch && debouncedQuery.trim() && (
                    <CommandGroup>
                      <CommandItem value='see-all' onSelect={() => navigate(`/search?q=${encodeURIComponent(debouncedQueryText)}`)}>
                        See all results for &quot;{debouncedQueryText}&quot;
                      </CommandItem>
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}

// Pure helpers below component

function getPath(type: 'books' | 'series' | 'authors', slug: string | null, id: string) {
  return `/${type}/${slug ?? id}`
}

type ExactMatch =
  | { type: 'book'; id: string; title: string; slug: string | null }
  | { type: 'series'; id: string; name: string; slug: string | null }
  | { type: 'author'; id: string; name: string; slug: string | null }

function getExactMatchPath(exactMatch: ExactMatch) {
  return getPath(TYPE_TO_ROUTE[exactMatch.type], exactMatch.slug, exactMatch.id)
}

function loadRecentSearches(): RecentSearch[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY)
    return stored ? (JSON.parse(stored) as RecentSearch[]) : []
  } catch {
    return []
  }
}
