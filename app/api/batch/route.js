import { NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are an expert Indian corporate lawyer comparing a term sheet against a received contract draft. Your task is to find every clause where the received draft DEVIATES from what was agreed in the term sheet.

Focus on these clause types: Indemnity, Limitation of Liability, Non-Compete, Non-Solicit, Governing Law, Dispute Resolution/Arbitration, Representations & Warranties, Termination, Conditions Precedent, Confidentiality, Data Protection, Assignment, Audit Rights, Exclusivity, Most Favored Customer, Change of Control.

You must detect THREE types of deviations:
1. MODIFIED: A clause exists in both documents but the received draft changes the terms in a way that disadvantages our client
2. ADDED: A clause appears in the received draft that was NOT present in the term sheet at all.
3. OMITTED: A clause was present in the term sheet but has been REMOVED entirely from the received draft.

For ADDED clauses, set termSheetPosition to "Not present in term sheet — this clause was added by counterparty"
For OMITTED clauses, set receivedDraftPosition to "Removed from draft — this protection was deleted"

Output ONLY a valid JSON object. No text before or after. No markdown code fences.

{
  "deviations": [
    {
      "clauseName": "string",
      "deviationType": "Modified" | "Added" | "Omitted",
      "termSheetPosition": "what the term sheet says in 1-2 sentences",
      "receivedDraftPosition": "how the draft differs in 1-2 sentences",
      "riskLevel": "High" | "Medium" | "Low",
      "explanation": "1-2 sentence practical explanation of the impact on our client"
    }
  ]
}

If no deviations found, return: {"deviations":[]}
Only report ACTUAL differences where the received draft is worse for our client. Do not hallucinate.`

async function analyzeOnePair({ doc1Text, doc2Text, apiKey }) {
  const userMessage = `DOCUMENT A (Term Sheet / Agreed Position):\n\n${doc1Text}\n\n---\n\nDOCUMENT B (Received Draft):\n\n${doc2Text}`

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.1,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`DeepSeek returned ${response.status}`)
  }

  const data = await response.json()
  let rawContent = (data.choices?.[0]?.message?.content || '').trim()

  if (rawContent.startsWith('```json')) {
    rawContent = rawContent.replace(/^```json\n?/, '').replace(/\n?```$/, '')
  } else if (rawContent.startsWith('```')) {
    rawContent = rawContent.replace(/^```\n?/, '').replace(/\n?```$/, '')
  }

  const parsed = JSON.parse(rawContent)
  return parsed.deviations || []
}

/**
 * POST /api/batch-analyze
 *
 * Body: {
 *   pairs: [
 *     { pairId, doc1Text, doc2Text, doc1Name, doc2Name }
 *   ]
 * }
 *
 * Returns: {
 *   results: [
 *     { pairId, doc1Name, doc2Name, deviations, summary, error? }
 *   ]
 * }
 */
export async function POST(request) {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const { pairs } = await request.json()

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return NextResponse.json({ error: 'No pairs provided' }, { status: 400 })
    }

    const results = []

    // Run sequentially to avoid rate-limit issues
    for (const pair of pairs) {
      const { pairId, doc1Text, doc2Text, doc1Name, doc2Name } = pair

      try {
        const deviations = await analyzeOnePair({ doc1Text, doc2Text, apiKey })

        const summary = {
          total: deviations.length,
          high: deviations.filter((d) => d.riskLevel === 'High').length,
          medium: deviations.filter((d) => d.riskLevel === 'Medium').length,
          low: deviations.filter((d) => d.riskLevel === 'Low').length,
          added: deviations.filter((d) => d.deviationType === 'Added').length,
          omitted: deviations.filter((d) => d.deviationType === 'Omitted').length,
          modified: deviations.filter((d) => d.deviationType === 'Modified').length,
        }

        results.push({ pairId, doc1Name, doc2Name, deviations, summary })
      } catch (err) {
        console.error(`Error analyzing pair ${pairId}:`, err)
        results.push({
          pairId,
          doc1Name,
          doc2Name,
          deviations: [],
          summary: { total: 0, high: 0, medium: 0, low: 0, added: 0, omitted: 0, modified: 0 },
          error: err.message || 'Analysis failed for this pair',
        })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Error in batch-analyze API:', error)
    return NextResponse.json(
      { error: 'Batch analysis failed', details: error.message },
      { status: 500 }
    )
  }
}