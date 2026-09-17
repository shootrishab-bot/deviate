// ─── Document auto-pairing ───────────────────────────────────────────────────
//
// Suggests which counterparty document corresponds to each firm document, from
// the filenames alone.

/**
 * Filename similarity above this pre-selects a pairing. Below it the suggestion
 * is still shown with its score, but the user has to accept it: a loose
 * threshold here quietly paired unrelated documents and analysed them.
 */
export const AUTO_PAIR_THRESHOLD = 0.55
export const SUGGEST_THRESHOLD = 0.25

const normalizeName = (s) =>
  String(s || '').toLowerCase().replace(/\.(pdf|docx)$/i, '').replace(/[^a-z0-9]/g, '')

const charBigrams = (s) => {
  const grams = new Set()
  if (s.length < 2) {
    if (s) grams.add(s)
    return grams
  }
  for (let i = 0; i < s.length - 1; i++) grams.add(s.slice(i, i + 2))
  return grams
}

/**
 * Dice coefficient over character bigrams, 0 (unrelated) to 1 (same name).
 *
 * The previous version counted how many of one name's letters appeared
 * anywhere in the other, which ignores order and double-counts repeats:
 * "SPA_TermSheet" and "Invoice_March" scored 0.58 and were auto-paired. Bigrams
 * keep adjacency, so unrelated names score near zero.
 */
export const filenameSimilarity = (a, b) => {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const ga = charBigrams(na)
  const gb = charBigrams(nb)
  let shared = 0
  for (const gram of ga) if (gb.has(gram)) shared++
  const dice = (2 * shared) / (ga.size + gb.size)

  // One name fully inside the other (e.g. "NDA" in "NDA_counterparty") is
  // evidence in its own right, so take whichever signal is stronger.
  const longer = na.length >= nb.length ? na : nb
  const shorter = na.length >= nb.length ? nb : na
  const containment = longer.includes(shorter) ? shorter.length / longer.length : 0

  return Math.max(dice, containment)
}

/**
 * @returns {{pairs: Object, suggestions: Object, scores: Object}} keyed by firm
 * document name. `pairs` holds pre-selected matches, `suggestions` holds the
 * weaker ones that need confirming.
 */
export const buildAutoSuggestions = (firmDocs, counterpartyDocs) => {
  const pairs = {}
  const suggestions = {}
  const scores = {}
  firmDocs.forEach((fd) => {
    let best = null
    let bestScore = 0
    counterpartyDocs.forEach((cd) => {
      const score = filenameSimilarity(fd.name, cd.name)
      if (score > bestScore) { bestScore = score; best = cd.name }
    })
    scores[fd.name] = bestScore
    pairs[fd.name] = bestScore >= AUTO_PAIR_THRESHOLD ? best : null
    suggestions[fd.name] = bestScore >= SUGGEST_THRESHOLD ? best : null
  })
  return { pairs, suggestions, scores }
}
