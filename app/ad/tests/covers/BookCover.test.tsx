import { render, screen } from '@testing-library/react'
import { BookCover, BookCoverSkeleton } from '@/components/books/BookCover'
import { createMockBook, testCovers } from './test-utils'

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...props} />
  },
}))

// Mock ProgressiveImage component
jest.mock('@/components/ui/ProgressiveImage', () => ({
  ProgressiveImage: ({ lowResSrc, highResSrc, alt }: { lowResSrc: string; highResSrc: string; alt: string }) => {
    return (
      <div data-testid='progressive-image'>
        <img src={lowResSrc} alt={`${alt} (low res)`} data-testid='low-res' />
        <img src={highResSrc} alt={`${alt} (high res)`} data-testid='high-res' />
      </div>
    )
  },
}))

describe('BookCover', () => {
  describe('Portrait covers', () => {
    it('renders portrait cover with correct aspect ratio', () => {
      // Portrait: 522x370 (aspect ratio ~1.41, > 1.05 threshold, so uses default 2/3)
      const book = createMockBook({
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

      const { container } = render(<BookCover book={book} />)
      const wrapper = container.firstChild as HTMLElement

      expect(wrapper).toBeInTheDocument()
      // Aspect ratio 522/370 = 1.41, which is > 1.05, so should use default 2/3
      expect(wrapper).toHaveStyle({ aspectRatio: '0.6666666666666666' })
    })

    it('renders true portrait cover (height > width) with actual aspect ratio', () => {
      const book = createMockBook({
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

      const { container } = render(<BookCover book={book} />)
      const wrapper = container.firstChild as HTMLElement

      expect(wrapper).toBeInTheDocument()
      expect(wrapper).toHaveStyle({ aspectRatio: '0.6666666666666666' })
    })

    it('renders portrait cover with both url and urlFull using ProgressiveImage', () => {
      const book = createMockBook({
        cover: {
          url: 'https://example.com/cover-medium.jpg',
          urlThumb: null,
          urlFull: 'https://example.com/cover-full.jpg',
          width: 300,
          height: 450,
          blurHash: null,
          dominantColor: null,
          sourceUrl: null,
          sourceAsin: null,
          sourceFormat: null,
        },
      })

      render(<BookCover book={book} />)

      expect(screen.getByTestId('progressive-image')).toBeInTheDocument()
      expect(screen.getByTestId('low-res')).toHaveAttribute('src', 'https://example.com/cover-medium.jpg')
      expect(screen.getByTestId('high-res')).toHaveAttribute('src', 'https://example.com/cover-full.jpg')
    })
  })

  describe('Landscape covers', () => {
    it('renders landscape cover with default 2/3 aspect ratio', () => {
      // Landscape: 1500x1156 (aspect ratio ~1.30, > 1.05 threshold, uses default)
      const book = createMockBook({
        title: 'Landscape Book',
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

      const { container } = render(<BookCover book={book} />)
      const wrapper = container.firstChild as HTMLElement

      expect(wrapper).toBeInTheDocument()
      // Should use default 2/3 aspect ratio since 1.30 > 1.05
      expect(wrapper).toHaveStyle({ aspectRatio: '0.6666666666666666' })
    })

    it('renders landscape cover with both url and urlFull', () => {
      const book = createMockBook({
        cover: {
          url: 'https://example.com/landscape-medium.jpg',
          urlThumb: null,
          urlFull: 'https://example.com/landscape-full.jpg',
          width: 1500,
          height: 1156,
          blurHash: null,
          dominantColor: null,
          sourceUrl: null,
          sourceAsin: null,
          sourceFormat: null,
        },
      })

      render(<BookCover book={book} />)

      expect(screen.getByTestId('progressive-image')).toBeInTheDocument()
    })
  })

  describe('Edge cases', () => {
    it('renders cover with only url (no urlFull)', () => {
      const book = createMockBook({
        cover: {
          url: 'https://example.com/cover.jpg',
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

      render(<BookCover book={book} />)

      // Should use regular Image component, not ProgressiveImage
      expect(screen.queryByTestId('progressive-image')).not.toBeInTheDocument()
      const image = screen.getByAltText('Test Book')
      expect(image).toHaveAttribute('src', 'https://example.com/cover.jpg')
    })

    it('renders placeholder when cover is missing', () => {
      const book = createMockBook({
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

      render(<BookCover book={book} />)

      expect(screen.getByText('Test Book')).toBeInTheDocument()
      expect(screen.queryByAltText('Test Book')).not.toBeInTheDocument()
    })

    it('handles missing cover dimensions', () => {
      const book = createMockBook({
        cover: {
          url: 'https://example.com/cover.jpg',
          urlThumb: null,
          urlFull: null,
          width: 0, // Invalid dimension
          height: 0, // Invalid dimension
          blurHash: null,
          dominantColor: null,
          sourceUrl: null,
          sourceAsin: null,
          sourceFormat: null,
        },
      })

      const { container } = render(<BookCover book={book} />)
      const wrapper = container.firstChild as HTMLElement

      // Should default to 2/3 aspect ratio
      expect(wrapper).toHaveStyle({ aspectRatio: '0.6666666666666666' })
    })

    it('handles undefined cover dimensions', () => {
      const book = createMockBook({
        cover: {
          url: 'https://example.com/cover.jpg',
          urlThumb: null,
          urlFull: null,
          width: undefined as unknown as number,
          height: undefined as unknown as number,
          blurHash: null,
          dominantColor: null,
          sourceUrl: null,
          sourceAsin: null,
          sourceFormat: null,
        },
      })

      const { container } = render(<BookCover book={book} />)
      const wrapper = container.firstChild as HTMLElement

      // Should default to 2/3 aspect ratio
      expect(wrapper).toHaveStyle({ aspectRatio: '0.6666666666666666' })
    })

    it('handles cover with aspect ratio exactly at threshold', () => {
      const book = createMockBook({
        cover: {
          url: 'https://example.com/cover.jpg',
          urlThumb: null,
          urlFull: null,
          width: 105,
          height: 100, // Exactly 1.05 aspect ratio
          blurHash: null,
          dominantColor: null,
          sourceUrl: null,
          sourceAsin: null,
          sourceFormat: null,
        },
      })

      const { container } = render(<BookCover book={book} />)
      const wrapper = container.firstChild as HTMLElement

      // Should use actual aspect ratio since 1.05 is not > 1.05
      expect(wrapper).toHaveStyle({ aspectRatio: '1.05' })
    })

    it('handles cover with aspect ratio just above threshold', () => {
      const book = createMockBook({
        cover: {
          url: 'https://example.com/cover.jpg',
          urlThumb: null,
          urlFull: null,
          width: 106,
          height: 100, // 1.06 > 1.05 threshold
          blurHash: null,
          dominantColor: null,
          sourceUrl: null,
          sourceAsin: null,
          sourceFormat: null,
        },
      })

      const { container } = render(<BookCover book={book} />)
      const wrapper = container.firstChild as HTMLElement

      // Should use default 2/3 since 1.06 > 1.05
      expect(wrapper).toHaveStyle({ aspectRatio: '0.6666666666666666' })
    })
  })

  describe('Cover styles', () => {
    it('applies correct wrapper styles', () => {
      const book = createMockBook()
      const { container } = render(<BookCover book={book} />)
      const wrapper = container.firstChild as HTMLElement

      expect(wrapper).toHaveClass('shrink-0', 'w-full', 'max-w-[80vw]', 'md:max-w-[600px]', 'md:w-auto', 'self-start')
      expect(wrapper).toHaveStyle({
        width: '100%',
        height: 'auto',
        maxWidth: '600px',
        maxHeight: 'calc(100vh - 52px - 80px)',
      })
    })
  })

  describe('BookCoverSkeleton', () => {
    it('renders skeleton with correct styles', () => {
      const { container } = render(<BookCoverSkeleton />)
      const wrapper = container.firstChild as HTMLElement

      expect(wrapper).toBeInTheDocument()
      expect(wrapper).toHaveClass('shrink-0', 'w-full', 'max-w-[80vw]', 'md:max-w-[600px]', 'md:w-auto', 'self-start')
      expect(wrapper).toHaveStyle({
        aspectRatio: '0.6666666666666666',
      })

      const skeleton = wrapper.querySelector('.bg-muted')
      expect(skeleton).toBeInTheDocument()
      expect(skeleton).toHaveClass('animate-pulse')
    })
  })
})
