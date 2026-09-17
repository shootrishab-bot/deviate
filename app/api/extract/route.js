import { NextResponse } from 'next/server'
import { rateLimit, clientKey, tooManyRequests } from '../../../lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 60

// Parsing hostile PDF/DOCX files is CPU-bound and runs before anything else can
// reject the request, so cap what may be sent at all.
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_TOTAL_BYTES = 40 * 1024 * 1024
const MAX_FILES = 40
const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 }

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
  if (!isPdfFile(file) && !isDocxFile(file)) {
    throw new Error(`Unsupported file type: ${file.type || file.name}`)
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is larger than the ${MAX_FILE_BYTES / (1024 * 1024)}MB limit`)
  }
  const arrayBuffer = await file.arrayBuffer()
  if (isPdfFile(file)) return extractPdfText(arrayBuffer)
  return extractDocxText(arrayBuffer)
}

const USER_FACING_ERROR = /^(Unsupported file type|.+ is larger than the|Too many files|Upload is too large)/

const isUserFacing = (error) => USER_FACING_ERROR.test(error?.message || '')

/** Reject oversized or overlong uploads before any parser touches them. */
function checkUploadLimits(files) {
  if (files.length > MAX_FILES) {
    return `Too many files in one upload (max ${MAX_FILES}).`
  }
  const total = files.reduce((sum, f) => sum + (f.size || 0), 0)
  if (total > MAX_TOTAL_BYTES) {
    return `Upload is too large (max ${MAX_TOTAL_BYTES / (1024 * 1024)}MB in total).`
  }
  const oversized = files.find((f) => (f.size || 0) > MAX_FILE_BYTES)
  if (oversized) {
    return `${oversized.name} is larger than the ${MAX_FILE_BYTES / (1024 * 1024)}MB per-file limit.`
  }
  return null
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
    const limit = rateLimit({ key: clientKey(request, 'extract'), ...RATE_LIMIT })
    if (!limit.ok) {
      const { body, headers } = tooManyRequests(
        limit.retryAfterSeconds,
        'Too many uploads from this location. Please wait a moment and try again.'
      )
      return NextResponse.json(body, { status: 429, headers })
    }

    const formData = await request.formData()

    const allFiles = [...formData.values()].filter((v) => v instanceof File)
    const limitError = checkUploadLimits(allFiles)
    if (limitError) {
      return NextResponse.json({ error: limitError }, { status: 413 })
    }

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
      // Our own validation messages help the user; anything else (a parser
      // throwing on a malformed file) stays in the log.
      { error: isUserFacing(error) ? error.message : 'Failed to read one of the documents. Check that each file is a valid PDF or Word document.' },
      { status: 500 }
    )
  }
}