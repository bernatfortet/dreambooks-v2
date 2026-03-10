import { BookCover, BookCoverSkeleton } from '@/components/books/BookCover'
import { createMockBook, testCovers } from './test-utils'

export default function CoverTestsPage() {
  // Portrait cover: 522x370 (aspect ratio 1.41, but treated as landscape > 1.05 threshold)
  const portraitBook = createMockBook({
    title: 'Portrait Cover (522x370)',
    cover: {
      url: testCovers.portrait.url,
      urlThumb: null,
      urlFull: null,
      width: testCovers.portrait.width,
      height: testCovers.portrait.height,
      blurHash: null,
      dominantColor: null,
      sourceUrl: null,
      sourceAsin: null,
      sourceFormat: null,
    },
  })

  // Landscape cover: 1500x1156 (aspect ratio 1.30, > 1.05 threshold)
  const landscapeBook = createMockBook({
    title: 'Landscape Cover (1500x1156)',
    cover: {
      url: testCovers.landscape.url,
      urlThumb: null,
      urlFull: null,
      width: testCovers.landscape.width,
      height: testCovers.landscape.height,
      blurHash: null,
      dominantColor: null,
      sourceUrl: null,
      sourceAsin: null,
      sourceFormat: null,
    },
  })

  // True portrait (height > width)
  const truePortraitBook = createMockBook({
    title: 'True Portrait Cover (300x450)',
    cover: {
      url: testCovers.truePortrait.url,
      urlThumb: null,
      urlFull: null,
      width: testCovers.truePortrait.width,
      height: testCovers.truePortrait.height,
      blurHash: null,
      dominantColor: null,
      sourceUrl: null,
      sourceAsin: null,
      sourceFormat: null,
    },
  })

  // Cover with both url and urlFull (progressive loading)
  const progressiveBook = createMockBook({
    title: 'Progressive Cover (with urlFull)',
    cover: {
      url: 'https://via.placeholder.com/400x600',
      urlThumb: null,
      urlFull: 'https://via.placeholder.com/800x1200',
      width: 400,
      height: 600,
      blurHash: null,
      dominantColor: null,
      sourceUrl: null,
      sourceAsin: null,
      sourceFormat: null,
    },
  })

  // Cover with only url (no urlFull)
  const singleUrlBook = createMockBook({
    title: 'Single URL Cover',
    cover: {
      url: 'https://via.placeholder.com/200x300',
      urlThumb: null,
      urlFull: null,
      width: 200,
      height: 300,
      blurHash: null,
      dominantColor: null,
      sourceUrl: null,
      sourceAsin: null,
      sourceFormat: null,
    },
  })

  // Missing cover
  const noCoverBook = createMockBook({
    title: 'No Cover Book',
    cover: {
      url: null,
      urlThumb: null,
      urlFull: null,
      width: 200,
      height: 300,
      blurHash: null,
      dominantColor: null,
      sourceUrl: null,
      sourceAsin: null,
      sourceFormat: null,
    },
  })

  // Missing dimensions
  const noDimensionsBook = createMockBook({
    title: 'No Dimensions Book',
    cover: {
      url: 'https://via.placeholder.com/200x300',
      urlThumb: null,
      urlFull: null,
      width: 0,
      height: 0,
      blurHash: null,
      dominantColor: null,
      sourceUrl: null,
      sourceAsin: null,
      sourceFormat: null,
    },
  })

  // Aspect ratio at threshold (1.05)
  const thresholdBook = createMockBook({
    title: 'Threshold Aspect Ratio (105x100)',
    cover: {
      url: 'https://via.placeholder.com/105x100',
      urlThumb: null,
      urlFull: null,
      width: 105,
      height: 100,
      blurHash: null,
      dominantColor: null,
      sourceUrl: null,
      sourceAsin: null,
      sourceFormat: null,
    },
  })

  // Aspect ratio just above threshold (1.06)
  const aboveThresholdBook = createMockBook({
    title: 'Above Threshold (106x100)',
    cover: {
      url: 'https://via.placeholder.com/106x100',
      urlThumb: null,
      urlFull: null,
      width: 106,
      height: 100,
      blurHash: null,
      dominantColor: null,
      sourceUrl: null,
      sourceAsin: null,
      sourceFormat: null,
    },
  })

  return (
    <div className='container mx-auto p-8 space-y-12'>
      <h1 className='text-3xl font-bold mb-8'>Book Cover Component Tests</h1>

      <section className='space-y-4'>
        <h2 className='text-2xl font-semibold'>Portrait Covers</h2>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
          <div className='space-y-2'>
            <p className='text-sm text-muted-foreground'>Portrait (522x370) - Landscape ratio, uses actual 1.41</p>
            <BookCover book={portraitBook} />
          </div>
          <div className='space-y-2'>
            <p className='text-sm text-muted-foreground'>True Portrait (300x450)</p>
            <BookCover book={truePortraitBook} />
          </div>
        </div>
      </section>

      <section className='space-y-4'>
        <h2 className='text-2xl font-semibold'>Landscape Covers</h2>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
          <div className='space-y-2'>
            <p className='text-sm text-muted-foreground'>Landscape (1500x1156) - Uses actual 1.30 ratio</p>
            <BookCover book={landscapeBook} />
          </div>
        </div>
      </section>

      <section className='space-y-4'>
        <h2 className='text-2xl font-semibold'>Progressive Loading</h2>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
          <div className='space-y-2'>
            <p className='text-sm text-muted-foreground'>With urlFull (ProgressiveImage)</p>
            <BookCover book={progressiveBook} />
          </div>
          <div className='space-y-2'>
            <p className='text-sm text-muted-foreground'>Single URL (Image)</p>
            <BookCover book={singleUrlBook} />
          </div>
        </div>
      </section>

      <section className='space-y-4'>
        <h2 className='text-2xl font-semibold'>Edge Cases</h2>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
          <div className='space-y-2'>
            <p className='text-sm text-muted-foreground'>No Cover</p>
            <BookCover book={noCoverBook} />
          </div>
          <div className='space-y-2'>
            <p className='text-sm text-muted-foreground'>No Dimensions (0x0)</p>
            <BookCover book={noDimensionsBook} />
          </div>
          <div className='space-y-2'>
            <p className='text-sm text-muted-foreground'>At Threshold (105x100)</p>
            <BookCover book={thresholdBook} />
          </div>
          <div className='space-y-2'>
            <p className='text-sm text-muted-foreground'>Above Threshold (106x100)</p>
            <BookCover book={aboveThresholdBook} />
          </div>
        </div>
      </section>

      <section className='space-y-4'>
        <h2 className='text-2xl font-semibold'>Skeleton</h2>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
          <div className='space-y-2'>
            <p className='text-sm text-muted-foreground'>Loading State</p>
            <BookCoverSkeleton />
          </div>
        </div>
      </section>
    </div>
  )
}
