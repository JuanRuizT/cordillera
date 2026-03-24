import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"

export interface PageContent {
  pageNumber: number
  text: string
}

export async function extractPdfPages(buffer: Buffer): Promise<PageContent[]> {
  // Load the PDF document
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  })

  const pdf = await loadingTask.promise
  const pages: PageContent[] = []

  // Extract text from each page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()

    // Combine all text items into a single string
    const text = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim()

    if (text.length > 10) {
      pages.push({
        pageNumber: i,
        text,
      })
    }
  }

  return pages
}

export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  })

  const pdf = await loadingTask.promise
  return pdf.numPages
}
