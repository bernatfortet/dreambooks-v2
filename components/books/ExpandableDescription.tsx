'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

type ExpandableDescriptionProps = {
  description: string
}

export function ExpandableDescription({ description }: ExpandableDescriptionProps) {
  const measurementRef = useRef<HTMLParagraphElement>(null)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    const measurementElement = measurementRef.current
    if (!measurementElement) return

    function updateOverflow() {
      const computedStyles = window.getComputedStyle(measurementElement)
      const lineHeight = Number.parseFloat(computedStyles.lineHeight)

      if (!Number.isFinite(lineHeight)) {
        setHasOverflow(false)
        return
      }

      setHasOverflow(measurementElement.scrollHeight > lineHeight * 4 + 1)
    }

    updateOverflow()

    const resizeObserver = new ResizeObserver(updateOverflow)
    resizeObserver.observe(measurementElement)

    return () => {
      resizeObserver.disconnect()
    }
  }, [description])

  useEffect(() => {
    if (hasOverflow) return

    setIsExpanded(false)
  }, [hasOverflow])

  return (
    <div className='max-w-[660px]'>
      <div className='relative'>
        <p className={!isExpanded ? 'line-clamp-4 text-muted-foreground leading-relaxed' : 'text-muted-foreground leading-relaxed'}>
          {description}
        </p>

        <p
          ref={measurementRef}
          aria-hidden='true'
          className='absolute inset-0 invisible pointer-events-none text-muted-foreground leading-relaxed'
        >
          {description}
        </p>
      </div>

      {hasOverflow && (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='mt-2 h-auto px-0 py-0'
          onClick={() => setIsExpanded((currentValue) => !currentValue)}
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </div>
  )
}
