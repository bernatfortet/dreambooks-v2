'use client'

import Link from 'next/link'
import { useAuthActions, useAuthToken } from '@convex-dev/auth/react'
import { api } from '@/convex/_generated/api'
import { Loader } from '@/components/atomic/Loader'
import { CreateChildProfileDialog } from '@/components/profiles/CreateChildProfileDialog'
import { useActiveProfile } from '@/components/profiles/ActiveProfileProvider'
import { useConvexAuth, useQuery } from 'convex/react'
import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function AuthButton() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { signIn, signOut } = useAuthActions()
  const authToken = useAuthToken()
  const viewer = useQuery(api.users.queries.viewer)
  const [pendingAction, setPendingAction] = useState<'sign-in' | 'sign-out' | null>(null)
  const accountProfile = getDisplayProfile(viewer, decodeAuthToken(authToken))
  const isPending = pendingAction !== null

  if (isLoading) {
    return (
      <Button variant='outline' size='sm' disabled>
        Loading...
      </Button>
    )
  }

  if (isAuthenticated) {
    return (
      <UserMenu
        accountEmail={accountProfile.email}
        accountImageUrl={accountProfile.imageUrl}
        accountName={accountProfile.name}
        isPending={isPending}
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  return (
    <Button variant='outline' size='sm' disabled={isPending} onClick={() => void handleSignIn()}>
      {pendingAction === 'sign-in' ? (
        <span className='relative inline-flex items-center justify-center'>
          <span className='invisible'>Sign in with Google</span>
          <span className='absolute inset-0 flex items-center justify-center'>
            <Loader size={16} className='fill-current text-current' />
          </span>
        </span>
      ) : (
        'Sign in with Google'
      )}
    </Button>
  )

  async function handleSignIn() {
    setPendingAction('sign-in')

    try {
      const result = await signIn('google')

      // Convex Auth triggers the browser redirect and then resolves.
      // Keep the button disabled so it doesn't flash back before navigation.
      if (result.redirect || result.signingIn) return

      setPendingAction(null)
    } catch (error) {
      setPendingAction(null)
      throw error
    }
  }

  async function handleSignOut() {
    await runAuthAction({
      action: signOut,
      pendingAction: 'sign-out',
      setPendingAction,
    })
  }
}

type ViewerProfile = {
  email?: string
  imageUrl?: string
  name?: string
} | null | undefined

type AuthTokenProfile = {
  email?: string
  givenName?: string
  name?: string
  picture?: string
  pictureUrl?: string
}

const CHILD_AVATAR_PALETTES = [
  { backgroundColor: '#FDE68A', color: '#92400E' },
  { backgroundColor: '#BFDBFE', color: '#1E3A8A' },
  { backgroundColor: '#C7D2FE', color: '#3730A3' },
  { backgroundColor: '#FBCFE8', color: '#9D174D' },
  { backgroundColor: '#BBF7D0', color: '#166534' },
  { backgroundColor: '#FED7AA', color: '#9A3412' },
] as const

function UserMenu({
  accountEmail,
  accountImageUrl,
  accountName,
  isPending,
  onSignOut,
}: {
  accountEmail?: string
  accountImageUrl?: string
  accountName?: string
  isPending: boolean
  onSignOut: () => void
}) {
  const { activeProfile, profiles, setActiveProfileId } = useActiveProfile()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const accountLabel = accountName ?? accountEmail ?? 'User'
  const triggerLabel = activeProfile?.name ?? accountLabel
  const triggerProfileAvatar = getProfileAvatarProps({
    accountImageUrl,
    imageUrl: activeProfile?.imageUrl,
    label: triggerLabel,
    profileType: activeProfile?.type,
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type='button'
            className='flex size-9 items-center justify-center overflow-hidden rounded-full border bg-background shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'
            disabled={isPending}
            aria-label='Open account menu'
          >
            <ProfileAvatar {...triggerProfileAvatar} sizeClassName='size-full' />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align='end' sideOffset={8}>
          <DropdownMenuLabel>
            <p className='truncate text-sm font-medium'>{activeProfile?.name ?? accountLabel}</p>
          </DropdownMenuLabel>

          {activeProfile?.slug ? (
            <DropdownMenuItem asChild>
              <Link href={`/profiles/${activeProfile.slug}`}>View Profile</Link>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Change Profile</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuLabel className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Profiles</DropdownMenuLabel>

              {profiles.map((profile) => (
                <DropdownMenuItem key={profile._id} disabled={isPending} onSelect={() => setActiveProfileId(profile._id)}>
                  <ProfileAvatar {...getProfileAvatarProps({ accountImageUrl, imageUrl: profile.imageUrl, label: profile.name, profileType: profile.type })} sizeClassName='size-5' />
                  <span className='flex-1 truncate'>{profile.name}</span>
                  <span className='text-xs text-muted-foreground'>{profile.type === 'self' ? 'You' : 'Child'}</span>
                  {activeProfile?._id === profile._id ? <Check className='size-4 text-primary' /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem disabled={isPending} onSelect={() => setIsCreateDialogOpen(true)}>
            <Plus className='size-4' />
            Add child profile
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {accountEmail ? <DropdownMenuLabel className='text-xs font-normal text-muted-foreground'>{accountEmail}</DropdownMenuLabel> : null}

          <DropdownMenuItem disabled={isPending} onSelect={onSignOut}>
            {isPending ? 'Signing out...' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateChildProfileDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreated={(profileId) => {
          setActiveProfileId(profileId)
        }}
      />
    </>
  )
}

function getDisplayProfile(viewer: ViewerProfile, tokenProfile: AuthTokenProfile | null) {
  return {
    email: viewer?.email ?? tokenProfile?.email ?? undefined,
    imageUrl: viewer?.imageUrl ?? tokenProfile?.pictureUrl ?? tokenProfile?.picture ?? undefined,
    name: viewer?.name ?? tokenProfile?.name ?? tokenProfile?.givenName ?? undefined,
  }
}

function getProfileAvatarProps(args: {
  accountImageUrl?: string
  imageUrl?: string
  label: string
  profileType?: 'self' | 'child'
}) {
  const profileType = args.profileType ?? 'self'

  return {
    imageUrl: profileType === 'self' ? args.imageUrl ?? args.accountImageUrl : args.imageUrl,
    label: args.label,
    profileType,
  }
}

function decodeAuthToken(token: string | null | undefined): AuthTokenProfile | null {
  if (!token) return null

  const [, payload] = token.split('.')
  if (!payload) return null

  try {
    const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decodedPayload) as AuthTokenProfile
  } catch {
    return null
  }
}

async function runAuthAction({
  action,
  pendingAction,
  setPendingAction,
}: {
  action: () => Promise<unknown>
  pendingAction: 'sign-in' | 'sign-out'
  setPendingAction: (value: 'sign-in' | 'sign-out' | null) => void
}) {
  setPendingAction(pendingAction)

  try {
    await action()
  } finally {
    setPendingAction(null)
  }
}

function AvatarContent({ imageUrl, label }: { imageUrl?: string; label: string }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={label} className='size-full object-cover' referrerPolicy='no-referrer' />
  }

  return <span className='text-sm font-medium'>{getInitials(label)}</span>
}

function ProfileAvatar({
  imageUrl,
  label,
  profileType,
  sizeClassName,
}: {
  imageUrl?: string
  label: string
  profileType: 'self' | 'child'
  sizeClassName: string
}) {
  const childPalette = profileType === 'child' ? getChildAvatarPalette(label) : null

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold uppercase ${sizeClassName}`}
      style={
        childPalette
          ? {
              backgroundColor: childPalette.backgroundColor,
              color: childPalette.color,
            }
          : undefined
      }
    >
      <AvatarContent imageUrl={imageUrl} label={label} />
    </span>
  )
}

function getChildAvatarPalette(label: string) {
  const normalizedLabel = label.trim().toLowerCase()
  let hash = 0

  for (const character of normalizedLabel) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return CHILD_AVATAR_PALETTES[hash % CHILD_AVATAR_PALETTES.length]
}

function getInitials(label: string) {
  const words = label.trim().split(/\s+/).filter(Boolean)

  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase()

  return `${words[0].slice(0, 1)}${words[1].slice(0, 1)}`.toUpperCase()
}
