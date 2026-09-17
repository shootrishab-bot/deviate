// ─── Structural document alignment ───────────────────────────────────────────
//
// Runs before the AI call. The model used to receive two whole contracts and
// was asked to find every difference itself, which is unreliable on long
// documents and expensive. Instead we split both documents into clause blocks,
// align them, and hand the model a short list of candidate deviations to
// confirm, classify and explain.
//
// Everything here is deterministic and dependency-free. Similarity is the Dice
// coefficient over word bigrams: it tolerates rewording and reordering far
// better than edit distance, and unlike a character-overlap count it does not
// score unrelated legal prose highly just because English shares letters.

const MAX_BLOCK_CHARS = 1400        // per block version sent to the model
const CONTEXT_CHARS = 220           // per surrounding-sentence snippet
const MATCH_THRESHOLD = 0.4         // below this, blocks are not the same clause
const RESCUE_LABEL_THRESHOLD = 0.75 // same clause heading, body rewritten wholesale
const MIN_BLOCKS = 3                // fewer than this is not a usable structure
const DEGENERATE_SHARE = 0.6        // one block holding this much text is degenerate
const CANDIDATE_CHAR_BUDGET = 45000 // total block text across all candidates
const BLOCK_CAP_LADDER = [MAX_BLOCK_CHARS, 800, 450, 250]

// ─── Text normalization and similarity ───────────────────────────────────────

export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9'"\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function wordBigrams(normalized) {
  const words = normalized.split(' ').filter(Boolean)
  const grams = new Set()
  if (words.length === 0) return grams
  if (words.length === 1) {
    grams.add(words[0])
    return grams
  }
  for (let i = 0; i < words.length - 1; i++) grams.add(`${words[i]} ${words[i + 1]}`)
  return grams
}

function diceFromSets(a, b) {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  let shared = 0
  for (const gram of small) if (large.has(gram)) shared++
  return (2 * shared) / (a.size + b.size)
}

/** Similarity of two pieces of text, 0 (unrelated) to 1 (same wording). */
export function similarity(a, b) {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  if (!na && !nb) return 1
  if (na === nb) return 1
  return diceFromSets(wordBigrams(na), wordBigrams(nb))
}

// ─── Block splitting ─────────────────────────────────────────────────────────

const SECTION_RE = /^(clause|section|article|schedule|annexure|appendix|part)\s+[0-9ivxlc]+[a-z]?\b/i
const NUMBERED_RE = /^\d+(\.\d+)*\.?\s+\S/
const LETTERED_RE = /^\(([a-z]|[ivxlc]+|\d+)\)\s+\S/i
const ALL_CAPS_RE = /^[A-Z][A-Z0-9 \-&',.():/]{3,}$/

function isHeadingLine(line) {
  const t = line.trim()
  if (!t || t.length > 100) return false
  if (SECTION_RE.test(t)) return true
  if (NUMBERED_RE.test(t)) return true
  if (LETTERED_RE.test(t)) return true
  if (ALL_CAPS_RE.test(t) && /[A-Z]{3}/.test(t)) return true
  return false
}

function isSectionHeading(line) {
  const t = line.trim()
  return SECTION_RE.test(t) || (ALL_CAPS_RE.test(t) && /[A-Z]{3}/.test(t))
}

function splitParagraphs(text, singleNewline) {
  const raw = singleNewline ? String(text || '').split(/\n+/) : String(text || '').split(/\n\s*\n+/)
  return raw.map((p) => p.replace(/\s+\n/g, '\n').trim()).filter(Boolean)
}

function assembleBlocks(paragraphs) {
  const blocks = []
  let section = null
  let pendingHeading = null

  const push = (heading, body) => {
    const text = body.join('\n').trim()
    if (!text) return
    blocks.push({
      index: blocks.length,
      section,
      heading: heading || null,
      text,
      label: [section, heading].filter(Boolean).join(' / ') || null,
    })
  }

  for (const para of paragraphs) {
    const firstLine = para.split('\n')[0]
    const headingOnly = para.split('\n').length === 1 && isHeadingLine(para)

    if (headingOnly) {
      // A heading paragraph on its own: remember it for the body that follows.
      if (pendingHeading) push(pendingHeading, [])
      if (isSectionHeading(para)) {
        section = para.trim()
        pendingHeading = null
      } else {
        pendingHeading = para.trim()
      }
      continue
    }

    if (isHeadingLine(firstLine) && para.split('\n').length > 1) {
      // Heading and body arrived in one paragraph.
      const [head, ...rest] = para.split('\n')
      if (pendingHeading) push(pendingHeading, [])
      push(head.trim(), rest)
      pendingHeading = null
      continue
    }

    push(pendingHeading, [para])
    pendingHeading = null
  }

  if (pendingHeading) push(pendingHeading, [])
  return blocks.map((b, i) => ({ ...b, index: i }))
}

function isDegenerate(blocks, totalChars) {
  if (blocks.length < MIN_BLOCKS) return true
  const largest = blocks.reduce((max, b) => Math.max(max, b.text.length), 0)
  return totalChars > 0 && largest / totalChars > DEGENERATE_SHARE
}

/**
 * Split a document into clause blocks. Tries blank-line paragraphs with clause
 * headers first, then single-newline paragraphs for documents that arrive
 * without blank lines (common in PDF extraction). Returns [] when neither
 * produces a usable structure, which puts the caller into full-document mode.
 */
export function splitIntoBlocks(text) {
  const totalChars = String(text || '').trim().length
  if (!totalChars) return []

  for (const singleNewline of [false, true]) {
    const blocks = assembleBlocks(splitParagraphs(text, singleNewline))
    if (!isDegenerate(blocks, totalChars)) return blocks
  }
  return []
}

// ─── Alignment ───────────────────────────────────────────────────────────────

function firstSentence(text) {
  const match = String(text || '').match(/^.*?[.;:!?](\s|$)/s)
  const sentence = (match ? match[0] : String(text || '')).trim()
  return sentence.slice(0, CONTEXT_CHARS)
}

function lastSentence(text) {
  const clean = String(text || '').trim()
  const parts = clean.split(/(?<=[.;:!?])\s+/).filter(Boolean)
  const sentence = (parts.length ? parts[parts.length - 1] : clean).trim()
  return sentence.slice(-CONTEXT_CHARS)
}

function contextFor(blocks, index) {
  return {
    before: index > 0 ? lastSentence(blocks[index - 1].text) : '',
    after: index < blocks.length - 1 ? firstSentence(blocks[index + 1].text) : '',
  }
}

/**
 * Greedy one-to-one alignment: score every A block against every B block, then
 * take the strongest pairings first so a clause cannot be claimed by a weaker
 * match earlier in the document.
 */
export function alignBlocks(aBlocks, bBlocks) {
  const aGrams = aBlocks.map((b) => wordBigrams(normalizeText(`${b.heading || ''} ${b.text}`)))
  const bGrams = bBlocks.map((b) => wordBigrams(normalizeText(`${b.heading || ''} ${b.text}`)))

  const scored = []
  for (let i = 0; i < aBlocks.length; i++) {
    for (let j = 0; j < bBlocks.length; j++) {
      const score = diceFromSets(aGrams[i], bGrams[j])
      if (score >= MATCH_THRESHOLD) scored.push({ i, j, score })
    }
  }
  scored.sort((x, y) => y.score - x.score)

  const aTaken = new Set()
  const bTaken = new Set()
  const matched = []
  for (const pair of scored) {
    if (aTaken.has(pair.i) || bTaken.has(pair.j)) continue
    aTaken.add(pair.i)
    bTaken.add(pair.j)
    matched.push(pair)
  }

  // Rescue pass: a clause whose body was rewritten wholesale scores below the
  // body threshold and would otherwise be reported as a deletion plus an
  // unrelated insertion. If both sides still carry the same clause heading,
  // treat them as one modified clause instead.
  const leftoverA = aBlocks.map((_, i) => i).filter((i) => !aTaken.has(i) && aBlocks[i].label)
  const leftoverB = bBlocks.map((_, j) => j).filter((j) => !bTaken.has(j) && bBlocks[j].label)
  const labelScores = []
  for (const i of leftoverA) {
    for (const j of leftoverB) {
      const labelScore = similarity(aBlocks[i].label, bBlocks[j].label)
      if (labelScore >= RESCUE_LABEL_THRESHOLD) {
        labelScores.push({ i, j, score: diceFromSets(aGrams[i], bGrams[j]), labelScore })
      }
    }
  }
  labelScores.sort((x, y) => y.labelScore - x.labelScore)
  for (const pair of labelScores) {
    if (aTaken.has(pair.i) || bTaken.has(pair.j)) continue
    aTaken.add(pair.i)
    bTaken.add(pair.j)
    matched.push({ i: pair.i, j: pair.j, score: pair.score })
  }

  return {
    matched: matched.sort((x, y) => x.i - y.i),
    unmatchedA: aBlocks.map((_, i) => i).filter((i) => !aTaken.has(i)),
    unmatchedB: bBlocks.map((_, j) => j).filter((j) => !bTaken.has(j)),
  }
}

// ─── Candidate building ──────────────────────────────────────────────────────

function truncate(text, cap) {
  const t = String(text || '').trim()
  return t.length > cap ? `${t.slice(0, cap)}…[truncated]` : t
}

function sideFor(blocks, index, cap) {
  const block = blocks[index]
  const ctx = contextFor(blocks, index)
  return {
    heading: block.label,
    text: truncate(block.text, cap),
    contextBefore: ctx.before,
    contextAfter: ctx.after,
  }
}

function buildAt(aBlocks, bBlocks, alignment, cap) {
  const candidates = []
  let n = 0
  const nextId = () => `c${++n}`

  for (const { i, j, score } of alignment.matched) {
    // Identical clauses never reach the model.
    if (normalizeText(aBlocks[i].text) === normalizeText(bBlocks[j].text)) continue
    candidates.push({
      id: nextId(),
      candidateType: 'Modified',
      similarity: Number(score.toFixed(2)),
      heading: aBlocks[i].label || bBlocks[j].label || null,
      termSheet: sideFor(aBlocks, i, cap),
      receivedDraft: sideFor(bBlocks, j, cap),
    })
  }

  for (const i of alignment.unmatchedA) {
    candidates.push({
      id: nextId(),
      candidateType: 'Omitted',
      similarity: 0,
      heading: aBlocks[i].label || null,
      termSheet: sideFor(aBlocks, i, cap),
      receivedDraft: null,
    })
  }

  for (const j of alignment.unmatchedB) {
    candidates.push({
      id: nextId(),
      candidateType: 'Added',
      similarity: 0,
      heading: bBlocks[j].label || null,
      termSheet: null,
      receivedDraft: sideFor(bBlocks, j, cap),
    })
  }

  return candidates
}

function candidateChars(candidates) {
  return candidates.reduce(
    (sum, c) => sum + (c.termSheet?.text.length || 0) + (c.receivedDraft?.text.length || 0),
    0
  )
}

/**
 * Compare two documents structurally.
 *
 * Returns either { mode: 'diff', candidates, stats } for the model to confirm,
 * or { mode: 'full', reason } when the documents have no usable clause
 * structure — in that case the caller falls back to sending full text, which is
 * slower and less precise but never produces garbage candidates.
 */
export function buildCandidates(doc1Text, doc2Text) {
  const aBlocks = splitIntoBlocks(doc1Text)
  const bBlocks = splitIntoBlocks(doc2Text)

  if (aBlocks.length === 0 || bBlocks.length === 0) {
    return { mode: 'full', reason: 'No usable clause structure detected', candidates: [] }
  }

  const alignment = alignBlocks(aBlocks, bBlocks)

  let candidates = []
  for (const cap of BLOCK_CAP_LADDER) {
    candidates = buildAt(aBlocks, bBlocks, alignment, cap)
    if (candidateChars(candidates) <= CANDIDATE_CHAR_BUDGET) break
  }

  if (candidates.length === 0) {
    return {
      mode: 'diff',
      candidates: [],
      stats: {
        blocksA: aBlocks.length,
        blocksB: bBlocks.length,
        matched: alignment.matched.length,
        identicalSkipped: alignment.matched.length,
        modified: 0,
        omitted: 0,
        added: 0,
      },
    }
  }

  const stats = {
    blocksA: aBlocks.length,
    blocksB: bBlocks.length,
    matched: alignment.matched.length,
    identicalSkipped:
      alignment.matched.length - candidates.filter((c) => c.candidateType === 'Modified').length,
    modified: candidates.filter((c) => c.candidateType === 'Modified').length,
    omitted: candidates.filter((c) => c.candidateType === 'Omitted').length,
    added: candidates.filter((c) => c.candidateType === 'Added').length,
  }

  return { mode: 'diff', candidates, stats }
}
