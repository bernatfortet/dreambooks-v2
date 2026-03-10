export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
} as const

export function getColumnCount(containerWidth: number): number {
  if (containerWidth >= BREAKPOINTS.lg) return 6
  if (containerWidth >= BREAKPOINTS.md) return 3
  return 2
}

export const MASONRY_GAP = 12

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
