// ─── Storage helpers ────────────────────────────────────────────────────────
// All data lives in localStorage under the 'deviate-reviews' key.
// A "review" is now a batch that may contain multiple document pairs.

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

// ── Batches ──────────────────────────────────────────────────────────────────

/**
 * Save a complete batch review.
 * @param {Object} batchData
 * @param {string} batchData.id
 * @param {string} batchData.date  ISO string
 * @param {Array}  batchData.pairs  Array of pair objects (see below)
 * @param {Object} batchData.summary  { totalPairs, totalDeviations, high, medium, low }
 *
 * Each pair:
 * { pairId, doc1Name, doc2Name, doc1Text, doc2Text, doc1Chars, doc2Chars,
 *   deviations: [...], summary: { total, high, medium, low } }
 */
export function saveBatch(batchData) {
  try {
    const existing = getBatches()
    existing.unshift(batchData)
    localStorage.setItem('deviate-reviews', JSON.stringify(existing))
  } catch (err) {
    console.error('Failed to save batch:', err)
  }
}

export function getBatches() {
  try {
    const raw = localStorage.getItem('deviate-reviews')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getBatch(id) {
  return getBatches().find((b) => b.id === id) || null
}

export function deleteBatch(id) {
  try {
    const filtered = getBatches().filter((b) => b.id !== id)
    localStorage.setItem('deviate-reviews', JSON.stringify(filtered))
    return true
  } catch {
    return false
  }
}

// ── Legacy single-review shim (kept for backward compat) ─────────────────────

export function saveReview(reviewData) {
  // Wrap a legacy single review as a single-pair batch
  const batch = {
    id: reviewData.id || generateId(),
    date: reviewData.date || new Date().toISOString(),
    pairs: [
      {
        pairId: reviewData.id,
        doc1Name: reviewData.doc1Name,
        doc2Name: reviewData.doc2Name,
        doc1Text: reviewData.doc1Text || '',
        doc2Text: reviewData.doc2Text || '',
        doc1Chars: reviewData.doc1Chars || 0,
        doc2Chars: reviewData.doc2Chars || 0,
        deviations: reviewData.deviations || [],
        summary: reviewData.summary || { total: 0, high: 0, medium: 0, low: 0 },
      },
    ],
    summary: reviewData.summary || { totalPairs: 1, totalDeviations: 0, high: 0, medium: 0, low: 0 },
  }
  saveBatch(batch)
}

export function getReviews() {
  return getBatches()
}

export function getReview(id) {
  return getBatch(id)
}

export function deleteReview(id) {
  return deleteBatch(id)
}