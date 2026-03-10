import { readFile } from 'fs/promises'
import { PDFParse } from 'pdf-parse'

export type PdfTextPage = {
  pageNumber: number
  text: string
}

export async function extractPdfTextPages(sourcePath: string): Promise<PdfTextPage[]> {
  const pdfData = new Uint8Array(await readFile(sourcePath))
  const parser = new PDFParse({ data: pdfData })

  try {
    const textResult = await parser.getText()

    return textResult.pages.map((page) => ({
      pageNumber: page.num,
      text: page.text,
    }))
  } finally {
    await parser.destroy()
  }
}
