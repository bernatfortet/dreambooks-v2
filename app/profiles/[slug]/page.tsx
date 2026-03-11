import { fetchQuery } from 'convex/nextjs'
import { notFound } from 'next/navigation'
import { api } from '@/convex/_generated/api'
import { PublicProfileShelves } from '@/components/profiles/PublicProfileShelves'

export const revalidate = 60

type PublicProfilePageProps = {
  params: Promise<{ slug: string }>
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { slug } = await params
  const profile = await fetchQuery(api.profiles.queries.getPublicBySlug, { slug })

  if (!profile) {
    notFound()
  }

  return (
    <main className='mx-auto flex w-full max-w-content flex-col gap-8 px-4 py-6'>
      <section className='space-y-3'>
        <p className='text-sm font-medium text-muted-foreground'>Public profile</p>
        <div className='space-y-1'>
          <h1 className='text-3xl font-semibold tracking-tight'>{profile.name}</h1>
          <p className='text-muted-foreground'>
            {profile.type === 'self' ? 'Reader profile' : 'Child profile'} with public likes and reading activity.
          </p>
        </div>
      </section>

      <PublicProfileShelves
        counts={profile.counts}
        profileId={profile._id}
        profileName={profile.name}
      />
    </main>
  )
}
