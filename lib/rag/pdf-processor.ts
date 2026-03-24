import { PDFParse } from "pdf-parse"

export interface PageContent {
  pageNumber: number
  text: string
}

export async function extractPdfPages(buffer: Buffer): Promise<PageContent[]> {
  // Use PDFParse class to extract text
  const parser = new PDFParse({ data: buffer })
  const data = await parser.getText()

  // Extract pages with their text
  const pages: PageContent[] = data.pages
    .map((page) => ({
      pageNumber: page.num,
      text: page.text.trim(),
    }))
    .filter((page) => page.text.length > 10)

  await parser.destroy()
  return pages
}

export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const parser = new PDFParse({ data: buffer })
  const data = await parser.getText()
  await parser.destroy()
  return data.total
}
