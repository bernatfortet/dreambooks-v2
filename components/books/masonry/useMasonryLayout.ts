import { MASONRY_GAP, estimateTitleLines, getTextBlockHeight } from './constants'

export type MasonryItem = {
  id: string
  title: string
  coverWidth: number
  coverHeight: number
}

export type Position = {
  x: number
  y: number
  width: number
  height: number
  imageHeight: number
}

export type MasonryLayout = {
  positions: Map<string, Position>
  containerHeight: number
}

export function calculateMasonryLayout(
  items: MasonryItem[],
  containerWidth: number,
  columnCount: number,
  gap: number = MASONRY_GAP,
): MasonryLayout {
  const columnWidth = (containerWidth - gap * (columnCount - 1)) / columnCount
  const columnHeights = Array(columnCount).fill(0)
  const positions = new Map<string, Position>()

  for (const item of items) {
    let minHeight = columnHeights[0]
    let columnIndex = 0
    for (let i = 1; i < columnCount; i++) {
      if (columnHeights[i] < minHeight) {
        minHeight = columnHeights[i]
        columnIndex = i
      }
    }

    // Guard against invalid dimensions - use 2:3 aspect ratio as fallback.
    // Also clamp clearly-landscape "covers" (often Amazon spreads) so they don't
    // collapse masonry cards into short landscape tiles.
    const fallbackAspectRatio = 2 / 3
    const rawWidth = item.coverWidth > 0 ? item.coverWidth : 200
    const rawHeight = item.coverHeight > 0 ? item.coverHeight : 300
    const rawAspectRatio = rawWidth / rawHeight

    const landscapeThreshold = 1.05
    const aspectRatio = rawAspectRatio > landscapeThreshold ? fallbackAspectRatio : rawAspectRatio
    const imageHeight = columnWidth / aspectRatio

    // Dynamic text block height based on estimated title lines
    const titleLines = estimateTitleLines(item.title, columnWidth)
    const textBlockHeight = getTextBlockHeight(titleLines)
    const cardHeight = imageHeight + textBlockHeight

    positions.set(item.id, {
      x: columnIndex * (columnWidth + gap),
      y: columnHeights[columnIndex],
      width: columnWidth,
      height: cardHeight,
      imageHeight,
    })

    columnHeights[columnIndex] += cardHeight + gap
  }

  const containerHeight = Math.max(...columnHeights) - gap

  return { positions, containerHeight }
}
