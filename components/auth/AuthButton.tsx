'use client'

import { useAuthActions, useAuthToken } from '@convex-dev/auth/react'
import { api } from '@/convex/_generated/api'
import { Loader } from '@/components/atomic/Loader'
import { useConvexAuth, useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function AuthButton() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { signIn, signOut } = useAuthActions()
  const authToken = useAuthToken()
  const viewer = useQuery(api.users.queries.viewer)
  const [pendingAction, setPendingAction] = useState<'sign-in' | 'sign-out' | null>(null)
  const profile = useMemo(() => getDisplayProfile(viewer, decodeAuthToken(authToken)), [authToken, viewer])
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
        displayEmail={profile.email}
        displayImageUrl={profile.imageUrl}
        displayName={profile.name}
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

function UserMenu({
  displayEmail,
  displayImageUrl,
  displayName,
  isPending,
  onSignOut,
}: {
  displayEmail?: string
  displayImageUrl?: string
  displayName?: string
  isPending: boolean
  onSignOut: () => void
}) {
  const label = displayName ?? displayEmail ?? 'User'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          className='flex size-9 items-center justify-center overflow-hidden rounded-full border bg-background shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'
          disabled={isPending}
          aria-label='Open account menu'
        >
          <AvatarContent imageUrl={displayImageUrl} label={label} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align='end' sideOffset={8}>
        <DropdownMenuLabel>
          <p className='truncate text-sm font-medium'>{label}</p>
          {displayEmail ? <p className='truncate text-xs text-muted-foreground'>{displayEmail}</p> : null}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isPending} onSelect={onSignOut}>
          {isPending ? 'Signing out...' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function getDisplayProfile(viewer: ViewerProfile, tokenProfile: AuthTokenProfile | null) {
  return {
    email: viewer?.email ?? tokenProfile?.email ?? undefined,
    imageUrl: viewer?.imageUrl ?? tokenProfile?.pictureUrl ?? tokenProfile?.picture ?? undefined,
    name: viewer?.name ?? tokenProfile?.name ?? tokenProfile?.givenName ?? undefined,
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

function getInitials(label: string) {
  const words = label.trim().split(/\s+/).filter(Boolean)

  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase()

  return `${words[0].slice(0, 1)}${words[1].slice(0, 1)}`.toUpperCase()
}
