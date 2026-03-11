export type ImageDimensions = {
  width: number
  height: number
}

export function getNaturalImageDimensions(image: HTMLImageElement): ImageDimensions | null {
  const width = image.naturalWidth
  const height = image.naturalHeight

  if (!width || !height) return null

  return { width, height }
}
