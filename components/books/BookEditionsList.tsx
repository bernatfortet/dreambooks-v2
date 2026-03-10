'use client'

import { Id } from '@/convex/_generated/dataModel'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Image from 'next/image'

// TypeScript doesn't support bracket notation for slash-separated module paths in the generated API type
// Extract types from Convex queries using FunctionReturnType
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
const editionsQueryRef = (api as any)['bookEditions/queries']['listByBookId']

type EditionArray = NonNullable<FunctionReturnType<typeof editionsQueryRef>>
type Edition = EditionArray[number]

type BookEditionsListProps = {
  editions: Edition[]
  primaryEditionId?: Id<'bookEditions'> | null
}

export function BookEditionsList({ editions, primaryEditionId }: BookEditionsListProps) {
  if (editions.length === 0) return null

  return (
    <div>
      <h4 className='text-sm font-medium mb-2'>Editions ({editions.length})</h4>
      <div className='grid grid-cols-2 md:grid-cols-3 gap-2'>
        {editions.map((edition) => {
          const isPrimary = edition._id === primaryEditionId
          return (
            <div
              key={edition._id}
              className={cn('flex items-center gap-2 p-2 border rounded-lg text-xs', isPrimary && 'border-2 border-foreground')}
            >
              {edition.mainCoverUrl ? (
                <div className='relative w-8 aspect-2/3 rounded overflow-hidden shrink-0'>
                  <Image src={edition.mainCoverUrl} alt={edition.format} fill className='object-cover' sizes='32px' />
                </div>
              ) : (
                <div className='w-8 aspect-2/3 rounded bg-muted shrink-0' />
              )}
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-1 flex-wrap'>
                  <Badge variant='secondary' className='text-[10px]'>
                    {edition.format}
                  </Badge>
                  {isPrimary && (
                    <Badge variant='default' className='text-[10px]'>
                      (primary)
                    </Badge>
                  )}
                </div>
                <div className='text-muted-foreground truncate mt-0.5'>{edition.sourceId}</div>
                {edition.isbn13 && <div className='text-muted-foreground truncate'>ISBN: {edition.isbn13}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
