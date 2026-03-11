import type { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'

type AwardListData = NonNullable<FunctionReturnType<typeof api.awards.queries.list>>
type AwardListItem = AwardListData[number]

type AwardGridProps = {
  awards: AwardListData
  emptyState?: ReactNode
  excludedAwardId?: AwardListItem['_id']
}

export function AwardGrid(props: AwardGridProps) {
  const {
    awards,
    emptyState = <p className='py-12 text-center text-muted-foreground'>No awards yet.</p>,
    excludedAwardId,
  } = props

  const visibleAwards = excludedAwardId ? awards.filter((award) => award._id !== excludedAwardId) : awards

  if (visibleAwards.length === 0) {
    return emptyState
  }

  return (
    <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
      {visibleAwards.map((award: AwardListItem) => (
        <AwardCard
          key={award._id}
          id={award.slug ?? award._id}
          name={award.name}
          description={award.description}
          imageUrl={award.imageUrl}
        />
      ))}
    </div>
  )
}

type AwardCardProps = {
  id: string
  name: string
  description: string | undefined
  imageUrl: string | null
}

function AwardCard({ id, name, description, imageUrl }: AwardCardProps) {
  return (
    <Link href={`/awards/${id}`} className='group block'>
      <div className='rounded-lg bg-white p-6 shadow-lg ring-1 ring-black/10 transition-shadow hover:shadow-xl'>
        <div className='flex gap-4'>
          {imageUrl ? (
            <div className='shrink-0'>
              <Image src={imageUrl} alt={name} width={80} height={80} className='h-20 w-20 object-contain' />
            </div>
          ) : (
            <div className='flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted font-medium text-muted-foreground'>
              {name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className='min-w-0 flex-1'>
            <h3 className='mb-2 text-lg font-semibold transition-colors group-hover:text-primary'>{name}</h3>
            {description && (
              <p className='line-clamp-3 text-sm text-muted-foreground'>{description}</p>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

function AwardGridSkeleton() {
  return (
    <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className='rounded-lg bg-white p-6 shadow-lg ring-1 ring-black/10'>
          <div className='flex gap-4'>
            <div className='h-20 w-20 shrink-0 rounded-lg bg-muted animate-pulse' />
            <div className='flex-1 space-y-2'>
              <div className='h-5 w-3/4 rounded bg-muted animate-pulse' />
              <div className='h-4 w-full rounded bg-muted animate-pulse' />
              <div className='h-4 w-5/6 rounded bg-muted animate-pulse' />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
