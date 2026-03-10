export const MASONRY_GAP = 12
const MIN_MASONRY_COLUMN_WIDTH = 180
const TARGET_MASONRY_COLUMN_WIDTH = 240
const MAX_MASONRY_COLUMN_WIDTH = 320

export function getColumnCount(containerWidth: number): number {
  const minColumns = Math.max(1, Math.ceil((containerWidth + MASONRY_GAP) / (MAX_MASONRY_COLUMN_WIDTH + MASONRY_GAP)))
  const maxColumns = Math.max(1, Math.floor((containerWidth + MASONRY_GAP) / (MIN_MASONRY_COLUMN_WIDTH + MASONRY_GAP)))
  const targetColumns = Math.max(1, Math.round((containerWidth + MASONRY_GAP) / (TARGET_MASONRY_COLUMN_WIDTH + MASONRY_GAP)))

  return clampColumnCount(targetColumns, minColumns, maxColumns)
}

export function getColumnWidth(containerWidth: number, columnCount: number): number {
  const availableWidth = containerWidth - MASONRY_GAP * (columnCount - 1)
  const columnWidth = availableWidth / columnCount

  return Math.max(0, columnWidth)
}

function clampColumnCount(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// Text block heights based on title lines
// mb-2 (8px) + title lines (24px each) + author (20px)
export const TEXT_BLOCK_HEIGHT_1_LINE = 52 // 8 + 24 + 20
export const TEXT_BLOCK_HEIGHT_2_LINES = 76 // 8 + 48 + 20

// Average character width for text-base (16px font)
const AVG_CHAR_WIDTH = 7.5

export function estimateTitleLines(title: string, columnWidth: number): 1 | 2 {
  const charsPerLine = columnWidth / AVG_CHAR_WIDTH
  return title.length > charsPerLine ? 2 : 1
}

export function getTextBlockHeight(titleLines: 1 | 2): number {
  return titleLines === 1 ? TEXT_BLOCK_HEIGHT_1_LINE : TEXT_BLOCK_HEIGHT_2_LINES
}
