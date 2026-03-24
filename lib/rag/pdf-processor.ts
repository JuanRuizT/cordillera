import { PDFParse } from "pdf-parse"

export interface PageContent {
  pageNumber: number
  text: string
}

export async function extractPdfPages(buffer: Buffer): Promise<PageContent[]> {
  const parser = new PDFParse({ data: buffer })

  try {
    const result = await parser.getText()

    const pages: PageContent[] = result.pages
      .map((page) => ({
        pageNumber: page.num,
        text: page.text.trim(),
      }))
      .filter((page) => page.text.length > 10)

    return pages
  } finally {
    await parser.destroy()
  }
}

export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const parser = new PDFParse({ data: buffer })

  try {
    const result = await parser.getText()
    return result.total
  } finally {
    await parser.destroy()
  }
}
