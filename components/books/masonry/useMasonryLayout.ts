import { MASONRY_GAP, estimateTitleLines, getColumnWidth, getTextBlockHeight } from './constants'

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
  const columnWidth = getColumnWidth(containerWidth, columnCount)
  const columnHeights = Array(columnCount).fill(0)
  const positions = new Map<string, Position>()

  for (const item of items) {
    const coverWidth = item.coverWidth > 0 ? item.coverWidth : 200
    const coverHeight = item.coverHeight > 0 ? item.coverHeight : 300
    const aspectRatio = coverWidth / coverHeight
    const placement = getPlacement(columnHeights)
    const itemWidth = columnWidth
    const imageHeight = itemWidth / aspectRatio

    // Dynamic text block height based on estimated title lines
    const titleLines = estimateTitleLines(item.title, itemWidth)
    const textBlockHeight = getTextBlockHeight(titleLines)
    const cardHeight = imageHeight + textBlockHeight

    positions.set(item.id, {
      x: placement.columnIndex * (columnWidth + gap),
      y: placement.y,
      width: itemWidth,
      height: cardHeight,
      imageHeight,
    })

    const nextColumnHeight = placement.y + cardHeight + gap
    columnHeights[placement.columnIndex] = nextColumnHeight
  }

  const containerHeight = Math.max(...columnHeights, 0) - gap

  return { positions, containerHeight }
}

function getPlacement(columnHeights: number[]): { columnIndex: number; y: number } {
  let bestColumnIndex = 0
  let bestY = Number.POSITIVE_INFINITY

  for (let startIndex = 0; startIndex < columnHeights.length; startIndex++) {
    const y = columnHeights[startIndex]
    if (y < bestY) {
      bestY = y
      bestColumnIndex = startIndex
    }
  }

  return {
    columnIndex: bestColumnIndex,
    y: Number.isFinite(bestY) ? bestY : 0,
  }
}
