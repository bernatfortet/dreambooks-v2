# Book Cover Component Tests

This directory contains tests for the `BookCover` component to verify different cover formats and edge cases.

## Test Files

### `BookCover.test.tsx`

Unit tests using React Testing Library. Tests cover:

- Portrait covers (aspect ratio < 1.05 threshold)
- Landscape covers (aspect ratio > 1.05 threshold, uses default 2/3)
- Progressive loading (with both `url` and `urlFull`)
- Single URL covers (only `url`)
- Missing covers (placeholder)
- Edge cases (missing dimensions, invalid dimensions, threshold cases)

### `page.tsx`

Visual test page accessible at `/ad/tests/covers` for manual visual testing of different cover formats in the browser.

## Running Tests

### Unit Tests

To run the unit tests, you'll need to set up a testing framework. Recommended setup:

```bash
# Install dependencies
bun add -d vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react

# Run tests
bun test app/ad/tests/covers
```

### Visual Tests

Start your development server and navigate to:

```
http://localhost:3000/ad/tests/covers
```

## Test Cases Covered

### Portrait Covers

- **522x370**: Aspect ratio 1.41, treated as landscape (> 1.05), uses default 2/3
- **300x450**: True portrait, uses actual aspect ratio (0.667)

### Landscape Covers

- **1500x1156**: Aspect ratio 1.30, > 1.05 threshold, uses default 2/3

### Progressive Loading

- Cover with both `url` and `urlFull` → Uses `ProgressiveImage` component
- Cover with only `url` → Uses standard `Image` component

### Edge Cases

- Missing cover → Shows placeholder with title
- Invalid dimensions (0x0) → Defaults to 2/3 aspect ratio
- Missing dimensions (undefined) → Defaults to 2/3 aspect ratio
- Aspect ratio exactly at threshold (1.05) → Uses actual aspect ratio
- Aspect ratio just above threshold (1.06) → Uses default 2/3

## Component Behavior

The `BookCover` component:

1. Calculates aspect ratio from `cover.width` and `cover.height`
2. If aspect ratio > 1.05 (landscape threshold), uses default 2/3 aspect ratio
3. Otherwise, uses the actual aspect ratio
4. If both `cover.url` and `cover.urlFull` exist, uses `ProgressiveImage` for progressive loading
5. If only `cover.url` exists, uses standard `Image` component
6. If no cover exists, shows placeholder with book title

## Example Cover URLs

- Portrait: `https://abundant-bee-200.convex.cloud/api/storage/73ff31fe-a3a2-421b-80cc-94f7aa90a085` (522x370)
- Landscape: `https://abundant-bee-200.convex.cloud/api/storage/eb5b31c5-b582-4d63-a796-64745fc2efa1` (1500x1156)
