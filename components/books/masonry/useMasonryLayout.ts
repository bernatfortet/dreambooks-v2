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

export type MasonryLayoutMode = 'masonry' | 'row-major'

export function calculateMasonryLayout(
  items: MasonryItem[],
  containerWidth: number,
  columnCount: number,
  gap: number = MASONRY_GAP,
  layoutMode: MasonryLayoutMode = 'masonry',
): MasonryLayout {
  if (layoutMode === 'row-major') {
    return calculateRowMajorLayout(items, containerWidth, columnCount, gap)
  }

  const columnWidth = getColumnWidth(containerWidth, columnCount)
  const columnHeights = Array(columnCount).fill(0)
  const positions = new Map<string, Position>()

  for (const item of items) {
    const placement = getPlacement(columnHeights)
    const itemDimensions = getCardDimensions(item, columnWidth)

    positions.set(item.id, {
      x: placement.columnIndex * (columnWidth + gap),
      y: placement.y,
      width: columnWidth,
      height: itemDimensions.cardHeight,
      imageHeight: itemDimensions.imageHeight,
    })

    const nextColumnHeight = placement.y + itemDimensions.cardHeight + gap
    columnHeights[placement.columnIndex] = nextColumnHeight
  }

  const containerHeight = Math.max(...columnHeights, 0) - gap

  return { positions, containerHeight }
}

function calculateRowMajorLayout(
  items: MasonryItem[],
  containerWidth: number,
  columnCount: number,
  gap: number,
): MasonryLayout {
  const columnWidth = getColumnWidth(containerWidth, columnCount)
  const positions = new Map<string, Position>()
  let currentRowTop = 0

  for (let startIndex = 0; startIndex < items.length; startIndex += columnCount) {
    const rowItems = items.slice(startIndex, startIndex + columnCount)
    let tallestRowHeight = 0

    rowItems.forEach((item, rowIndex) => {
      const itemDimensions = getCardDimensions(item, columnWidth)

      positions.set(item.id, {
        x: rowIndex * (columnWidth + gap),
        y: currentRowTop,
        width: columnWidth,
        height: itemDimensions.cardHeight,
        imageHeight: itemDimensions.imageHeight,
      })

      if (itemDimensions.cardHeight > tallestRowHeight) {
        tallestRowHeight = itemDimensions.cardHeight
      }
    })

    currentRowTop += tallestRowHeight + gap
  }

  const containerHeight = positions.size > 0 ? currentRowTop - gap : 0

  return { positions, containerHeight }
}

function getCardDimensions(item: MasonryItem, columnWidth: number) {
  const coverWidth = item.coverWidth > 0 ? item.coverWidth : 200
  const coverHeight = item.coverHeight > 0 ? item.coverHeight : 300
  const aspectRatio = coverWidth / coverHeight
  const imageHeight = columnWidth / aspectRatio
  const titleLines = estimateTitleLines(item.title, columnWidth)
  const textBlockHeight = getTextBlockHeight(titleLines)
  const cardHeight = imageHeight + textBlockHeight

  return {
    imageHeight,
    cardHeight,
  }
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
