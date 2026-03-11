type AwardResultMarkerProps = {
  tone: 'winner' | 'honor'
}

type AwardResultType = 'winner' | 'honor' | 'finalist' | 'other' | null | undefined
type AwardMarkerTone = AwardResultMarkerProps['tone']

const MARKER_GRADIENTS: Record<
  AwardMarkerTone,
  {
    outer: string
    inner: string
  }
> = {
  winner: {
    outer: 'bg-linear-to-br from-amber-300 via-amber-400 to-amber-600',
    inner: 'bg-linear-to-br from-yellow-100 via-yellow-300 to-amber-500',
  },
  honor: {
    outer: 'bg-linear-to-br from-slate-200 via-slate-400 to-slate-700',
    inner: 'bg-linear-to-br from-slate-50 via-slate-200 to-slate-400',
  },
}

export function AwardWinnerMarker() {
  return <AwardResultMarker tone='winner' />
}

export function AwardHonorMarker() {
  return <AwardResultMarker tone='honor' />
}

export function getAwardTitleMarkerByResultType(resultType: AwardResultType) {
  if (resultType !== 'winner' && resultType !== 'honor') return undefined
  return <AwardResultMarker tone={resultType} />
}

function AwardResultMarker({ tone }: AwardResultMarkerProps) {
  const gradients = MARKER_GRADIENTS[tone]

  return (
    <span className='relative mr-1 inline-block size-[15px] align-[-2px]' aria-hidden='true'>
      <span className={`absolute inset-0 rounded-full ${gradients.outer}`} />
      <span className={`absolute inset-px rounded-full ${gradients.inner}`} />
    </span>
  )
}
