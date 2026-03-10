'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'

type AwardListData = NonNullable<FunctionReturnType<typeof api.awards.queries.list>>
type AwardListItem = AwardListData[number]

export function AwardGrid() {
  const awards: AwardListData | undefined = useQuery(api.awards.queries.list)

  if (awards === undefined) {
    return <AwardGridSkeleton />
  }

  if (awards.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">
        No awards yet.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {awards.map((award: AwardListItem) => (
        <AwardCard
          key={award._id}
          id={award._id}
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
    <Link href={`/awards/${id}`} className="group block">
      <div className="rounded-lg bg-white p-6 ring-1 ring-black/10 shadow-lg hover:shadow-xl transition-shadow">
        <div className="flex gap-4">
          {imageUrl ? (
            <div className="shrink-0">
              <Image
                src={imageUrl}
                alt={name}
                width={80}
                height={80}
                className="w-20 h-20 object-contain"
              />
            </div>
          ) : (
            <div className="w-20 h-20 shrink-0 bg-muted rounded-lg flex items-center justify-center text-muted-foreground font-medium">
              {name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
              {name}
            </h3>
            {description && (
              <p className="text-sm text-muted-foreground line-clamp-3">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

function AwardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-lg bg-white p-6 ring-1 ring-black/10 shadow-lg">
          <div className="flex gap-4">
            <div className="w-20 h-20 bg-muted rounded-lg animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-muted rounded animate-pulse w-3/4" />
              <div className="h-4 bg-muted rounded animate-pulse w-full" />
              <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
