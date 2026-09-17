// ─── Storage helpers ────────────────────────────────────────────────────────
// All data lives in localStorage under the 'deviate-reviews' key.
// A "review" is now a batch that may contain multiple document pairs.
//
// Document text is deliberately NOT stored. It is only needed while a review is
// being run, and keeping it here filled the ~5MB localStorage budget after a
// handful of reviews, at which point saves failed silently.

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

// ── Batches ──────────────────────────────────────────────────────────────────

/** Keep only what the saved-reviews screen and re-export actually need. */
function slimPair(pair = {}) {
  return {
    pairId: pair.pairId,
    doc1Name: pair.doc1Name,
    doc2Name: pair.doc2Name,
    doc1Chars: pair.doc1Chars || 0,
    doc2Chars: pair.doc2Chars || 0,
    deviations: pair.deviations || [],
    summary: pair.summary || { total: 0, high: 0, medium: 0, low: 0 },
  }
}

/**
 * Save a complete batch review.
 * @param {Object} batchData
 * @param {string} batchData.id
 * @param {string} batchData.date  ISO string
 * @param {Array}  batchData.pairs  Array of pair objects (see slimPair)
 * @param {Object} batchData.summary  { totalPairs, totalDeviations, high, medium, low }
 * @returns {{ok: true} | {ok: false, error: string}} so callers can tell the user
 */
export function saveBatch(batchData) {
  const record = {
    ...batchData,
    pairs: (batchData.pairs || []).map(slimPair),
  }

  try {
    const existing = getBatches()
    existing.unshift(record)
    localStorage.setItem('deviate-reviews', JSON.stringify(existing))
    return { ok: true }
  } catch (err) {
    console.error('Failed to save batch:', err)
    const isQuota =
      err?.name === 'QuotaExceededError' ||
      err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err?.code === 22
    return {
      ok: false,
      error: isQuota
        ? 'This review could not be saved — browser storage is full. Delete older reviews under My Reviews and export anything you still need.'
        : `This review could not be saved to your browser (${err?.message || 'unknown error'}). Export the report before leaving this page.`,
    }
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
        doc1Chars: reviewData.doc1Chars || 0,
        doc2Chars: reviewData.doc2Chars || 0,
        deviations: reviewData.deviations || [],
        summary: reviewData.summary || { total: 0, high: 0, medium: 0, low: 0 },
      },
    ],
    summary: reviewData.summary || { totalPairs: 1, totalDeviations: 0, high: 0, medium: 0, low: 0 },
  }
  return saveBatch(batch)
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