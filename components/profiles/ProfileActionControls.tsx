'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ProfileActionLayout = 'panel' | 'card-overlay' | 'inline'

export type ProfileActionItem = {
  buttonLabel: string
  disabled: boolean
  icon: ReactNode
  isActive: boolean
  key: string
  label: string
  onClick: () => void
}

export function ProfileActionControls(props: {
  actions: ProfileActionItem[]
  footer?: ReactNode
  layout?: ProfileActionLayout
  profileName: string
}) {
  const { actions, footer, layout = 'panel', profileName } = props

  if (layout === 'card-overlay') {
    return (
      <div
        className={cn(
          'pointer-events-none absolute inset-x-2 top-2 z-10 flex items-start',
          actions.length > 1 ? 'justify-between' : 'justify-end',
        )}
      >
        {renderIconButtons(actions)}
      </div>
    )
  }

  if (layout === 'inline') {
    return (
      <div className='flex items-center gap-2'>
        {renderIconButtons(actions, true)}
      </div>
    )
  }

  return (
    <div className='rounded-lg border bg-muted/30 p-3'>
      <p className='text-sm font-medium'>For {profileName}</p>
      <div className='mt-3 flex flex-wrap gap-2'>
        {actions.map((action) => (
          <Button
            key={action.key}
            type='button'
            variant={action.isActive ? 'default' : 'outline'}
            size='sm'
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.icon}
            {action.buttonLabel}
          </Button>
        ))}
      </div>
      {footer ? <div className='mt-3'>{footer}</div> : null}
    </div>
  )
}

export function ProfileActionIconButton(props: {
  alwaysVisible?: boolean
  children: ReactNode
  disabled: boolean
  isActive: boolean
  label: string
  onClick: () => void
}) {
  const { alwaysVisible = false, children, disabled, isActive, label, onClick } = props

  return (
    <Button
      type='button'
      variant='outline'
      size='icon-sm'
      className={cn(
        'pointer-events-auto rounded-full shadow-sm backdrop-blur-sm transition-opacity',
        isActive
          ? 'border-brand bg-brand text-brand-foreground hover:bg-brand/90'
          : cn(
              'border-border/60 bg-background/90 hover:bg-background',
              !alwaysVisible && 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            ),
      )}
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
    >
      {children}
    </Button>
  )
}

function renderIconButtons(actions: ProfileActionItem[], alwaysVisible = false) {
  return actions.map((action) => (
    <ProfileActionIconButton
      key={action.key}
      alwaysVisible={alwaysVisible}
      disabled={action.disabled}
      isActive={action.isActive}
      label={action.label}
      onClick={action.onClick}
    >
      {action.icon}
    </ProfileActionIconButton>
  ))
}
