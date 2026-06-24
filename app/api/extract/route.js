import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const ensureDomPolyfills = () => {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor() {}
    }
  }
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
      constructor(data, width, height) {
        this.data = data
        this.width = width
        this.height = height
      }
    }
  }
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {
      constructor() {}
    }
  }
}

const loadPdfParse = async () => {
  ensureDomPolyfills()
  const module = await import('pdf-parse')
  return module.default || module
}

const loadMammoth = async () => {
  const module = await import('mammoth')
  return module.default || module
}

function isPdfFile(file) {
  return (
    file.type === 'application/pdf' ||
    file.name?.toLowerCase().endsWith('.pdf')
  )
}

function isDocxFile(file) {
  return (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name?.toLowerCase().endsWith('.docx')
  )
}

async function extractPdfText(arrayBuffer) {
  const pdfParse = await loadPdfParse()
  const result = await pdfParse(Buffer.from(arrayBuffer))
  return result?.text || ''
}

async function extractDocxText(arrayBuffer) {
  const mammoth = await loadMammoth()
  const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) })
  return result?.value || ''
}

async function extractText(file) {
  const arrayBuffer = await file.arrayBuffer()
  if (isPdfFile(file)) return extractPdfText(arrayBuffer)
  if (isDocxFile(file)) return extractDocxText(arrayBuffer)
  throw new Error(`Unsupported file type: ${file.type || file.name}`)
}

/**
 * POST /api/extract
 *
 * Accepts:
 *   - Legacy mode: doc1 + doc2 (single files)
 *   - Batch mode:  firmDoc_0, firmDoc_1, ... + counterpartyDoc_0, counterpartyDoc_1, ...
 *
 * Returns:
 *   - Legacy: { doc1Text, doc2Text, doc1Chars, doc2Chars }
 *   - Batch:  { firmDocs: [{name, text, chars}], counterpartyDocs: [{name, text, chars}] }
 */
export async function POST(request) {
  try {
    const formData = await request.formData()

    // Detect mode
    const doc1 = formData.get('doc1')
    const doc2 = formData.get('doc2')

    if (doc1 && doc2) {
      // Legacy single-pair mode
      const [doc1Text, doc2Text] = await Promise.all([
        extractText(doc1),
        extractText(doc2),
      ])
      return NextResponse.json({
        doc1Text,
        doc2Text,
        doc1Chars: doc1Text.length,
        doc2Chars: doc2Text.length,
      })
    }

    // Batch mode — collect all firm and counterparty files
    const firmFiles = []
    const counterpartyFiles = []

    for (const [key, value] of formData.entries()) {
      if (key.startsWith('firmDoc_') && value instanceof File) {
        firmFiles.push({ index: parseInt(key.split('_')[1], 10), file: value })
      }
      if (key.startsWith('counterpartyDoc_') && value instanceof File) {
        counterpartyFiles.push({ index: parseInt(key.split('_')[1], 10), file: value })
      }
    }

    if (firmFiles.length === 0 && counterpartyFiles.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      )
    }

    // Sort by index to preserve upload order
    firmFiles.sort((a, b) => a.index - b.index)
    counterpartyFiles.sort((a, b) => a.index - b.index)

    const extractAll = async (items) =>
      Promise.all(
        items.map(async ({ file }) => {
          const text = await extractText(file)
          return { name: file.name, text, chars: text.length }
        })
      )

    const [firmDocs, counterpartyDocs] = await Promise.all([
      extractAll(firmFiles),
      extractAll(counterpartyFiles),
    ])

    return NextResponse.json({ firmDocs, counterpartyDocs })
  } catch (error) {
    console.error('Error in extract API:', error)
    return NextResponse.json(
      { error: 'Failed to extract text: ' + (error?.message || String(error)) },
      { status: 500 }
    )
  }
}