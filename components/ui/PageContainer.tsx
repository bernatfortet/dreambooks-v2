import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type PageContainerProps = {
  children: ReactNode
  className?: string
  as?: 'main' | 'div' | 'section'
}

export function PageContainer({ children, className, as: Component = 'main' }: PageContainerProps) {
  return <Component className={cn('w-full max-w-content mx-auto py-8 px-4', className)}>{children}</Component>
}
