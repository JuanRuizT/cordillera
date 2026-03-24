import DOMMatrix from "dommatrix"

if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = DOMMatrix as unknown as typeof globalThis.DOMMatrix
}

export interface PageContent {
  pageNumber: number
  text: string
}

export async function extractPdfPages(buffer: Buffer): Promise<PageContent[]> {
  const { PDFParse } = await import("pdf-parse")
  
  // Use PDFParse class to extract text
  const parser = new PDFParse({ data: buffer })
  const data = await parser.getText()

  // Extract pages with their text
  const pages: PageContent[] = data.pages
    .map((page: { num: number; text: string }) => ({
      pageNumber: page.num,
      text: page.text.trim(),
    }))
    .filter((page: PageContent) => page.text.length > 10)

  await parser.destroy()
  return pages
}

export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const { PDFParse } = await import("pdf-parse")
  
  const parser = new PDFParse({ data: buffer })
  const data = await parser.getText()
  await parser.destroy()
  return data.total
}
