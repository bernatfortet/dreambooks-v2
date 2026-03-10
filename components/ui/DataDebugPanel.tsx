'use client'

import { useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type DataDebugPanelProps = {
  data: unknown
  label?: string
  className?: string
}

export function DataDebugPanel({ data, label = 'Raw Data', className }: DataDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  const jsonString = JSON.stringify(data, null, 2)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={cn('mt-4', className)}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between">
          <span>{label}</span>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">
          <code>{jsonString}</code>
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}
