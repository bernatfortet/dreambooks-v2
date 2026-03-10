type AwardResultMarkerProps = {
  tone: 'winner' | 'honor'
}

export function AwardWinnerMarker() {
  return <AwardResultMarker tone='winner' />
}

export function AwardHonorMarker() {
  return <AwardResultMarker tone='honor' />
}

function AwardResultMarker({ tone }: AwardResultMarkerProps) {
  return (
    <span
      className={`mr-1.5 inline-block size-[15px] rounded-full align-[-2px] ${getMarkerBackgroundClassName(tone)}`}
      aria-hidden='true'
    />
  )
}

function getMarkerBackgroundClassName(tone: AwardResultMarkerProps['tone']) {
  if (tone === 'winner') {
    return 'bg-linear-to-br from-amber-200 via-yellow-400 to-amber-600'
  }

  return 'bg-linear-to-br from-slate-100 via-slate-300 to-slate-500'
}
