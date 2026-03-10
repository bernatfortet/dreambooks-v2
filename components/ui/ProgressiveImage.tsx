'use client'

import Image from 'next/image'
import { useState } from 'react'
import { cn } from '@/lib/utils'

type ProgressiveImageProps = {
  lowResSrc: string
  highResSrc: string
  alt: string
  className?: string
  sizes?: string
  priority?: boolean
}

export function ProgressiveImage({ lowResSrc, highResSrc, alt, className, sizes, priority }: ProgressiveImageProps) {
  const [highResLoaded, setHighResLoaded] = useState(false)

  return (
    <div className={cn('relative', className)}>
      {/* Medium-res: always visible, shows instantly if cached */}
      <Image src={lowResSrc} alt={alt} fill className='object-contain' sizes={sizes} priority={priority} />

      {/* High-res: fades in when loaded */}
      <Image
        src={highResSrc}
        alt={alt}
        className={cn('object-contain transition-opacity duration-300', highResLoaded ? 'opacity-100' : 'opacity-0')}
        sizes={sizes}
        fill
        onLoad={() => setHighResLoaded(true)}
        priority={priority}
      />
    </div>
  )
}
