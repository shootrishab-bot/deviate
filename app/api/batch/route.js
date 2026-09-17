import { NextResponse } from 'next/server'
import { analyzeOnePair } from '../../../lib/analyze-pair'
import { rateLimit, clientKey, tooManyRequests } from '../../../lib/rate-limit'

// Vercel Hobby caps a function at 60s. The client splits large batches into
// sub-batches so a run stays well inside this; the budget below stops a slow
// pair from taking the whole window down with it.
export const maxDuration = 60

const MAX_PAIRS_PER_REQUEST = 3
const TIME_BUDGET_MS = 50_000
const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 }

// A pair of contracts this size is already far beyond anything the extractor
// produces from a real document; past it, the cost is the attacker's to choose.
const MAX_DOC_CHARS = 400_000
const MAX_PLAYBOOK_ENTRIES = 100

// ─── Route handler ───────────────────────────────────────────────────────────

/**
 * POST /api/batch
 *
 * Body: {
 *   pairs: [{ pairId, doc1Text, doc2Text, doc1Name, doc2Name }],
 *   playbookEntries: [{ clauseType, preferredPosition, dealbreaker, suggestedResponse }]
 * }
 *
 * Returns: { results: [{ pairId, doc1Name, doc2Name, deviations, summary, error? }] }
 *
 * The client sends large batches as several smaller requests so each one stays
 * inside maxDuration and progress can be shown as sub-batches land.
 */
export async function POST(request) {
  const startTime = Date.now()

  try {
    const limit = rateLimit({ key: clientKey(request, 'batch'), ...RATE_LIMIT })
    if (!limit.ok) {
      const { body, headers } = tooManyRequests(
        limit.retryAfterSeconds,
        'Too many analysis requests from this location. Please wait a moment and try again.'
      )
      return NextResponse.json(body, { status: 429, headers })
    }

    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const { pairs, playbookEntries } = await request.json()

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return NextResponse.json({ error: 'No pairs provided' }, { status: 400 })
    }
    if (pairs.length > MAX_PAIRS_PER_REQUEST) {
      return NextResponse.json(
        {
          error: `Too many pairs in one request (max ${MAX_PAIRS_PER_REQUEST}). Split the batch into smaller requests.`,
        },
        { status: 400 }
      )
    }

    const oversized = pairs.find(
      (p) => (p?.doc1Text?.length || 0) + (p?.doc2Text?.length || 0) > MAX_DOC_CHARS
    )
    if (oversized) {
      return NextResponse.json(
        { error: `Documents are too long to analyse (limit ${MAX_DOC_CHARS.toLocaleString()} characters per pair).` },
        { status: 413 }
      )
    }

    const entries = (Array.isArray(playbookEntries) ? playbookEntries : []).slice(0, MAX_PLAYBOOK_ENTRIES)
    const results = []

    // Sequential: DeepSeek rate-limits concurrent calls, and the time budget
    // below keeps the whole request inside maxDuration.
    for (const pair of pairs) {
      const { pairId, doc1Text, doc2Text, doc1Name, doc2Name } = pair
      const remaining = TIME_BUDGET_MS - (Date.now() - startTime)

      const emptySummary = { total: 0, high: 0, medium: 0, low: 0, added: 0, omitted: 0, modified: 0 }

      if (remaining <= 2000) {
        results.push({
          pairId,
          doc1Name,
          doc2Name,
          deviations: [],
          summary: emptySummary,
          error: 'Ran out of time before this pair was analyzed — try a smaller batch.',
        })
        continue
      }

      try {
        const { deviations, mode, stats, retried } = await analyzeOnePair({
          doc1Text,
          doc2Text,
          playbookEntries: entries,
          apiKey,
          timeoutMs: remaining,
        })

        console.log(
          `Pair ${pairId}: mode=${mode}${stats ? ` candidates=${JSON.stringify(stats)}` : ''} ` +
            `deviations=${deviations.length}${retried ? ' (after retry)' : ''}`
        )

        results.push({
          pairId,
          doc1Name,
          doc2Name,
          deviations,
          summary: {
            total: deviations.length,
            high: deviations.filter((d) => d.riskLevel === 'High').length,
            medium: deviations.filter((d) => d.riskLevel === 'Medium').length,
            low: deviations.filter((d) => d.riskLevel === 'Low').length,
            added: deviations.filter((d) => d.deviationType === 'Added').length,
            omitted: deviations.filter((d) => d.deviationType === 'Omitted').length,
            modified: deviations.filter((d) => d.deviationType === 'Modified').length,
          },
        })
      } catch (err) {
        console.error(`Error analyzing pair ${pairId}:`, err)
        results.push({
          pairId,
          doc1Name,
          doc2Name,
          deviations: [],
          summary: emptySummary,
          error: err.message || 'Analysis failed for this pair',
        })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    // Details stay in the server log; the response says only that it failed.
    console.error('Error in batch API:', error)
    return NextResponse.json({ error: 'Batch analysis failed' }, { status: 500 })
  }
}
