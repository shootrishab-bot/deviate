import { NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are an expert Indian corporate lawyer comparing a term sheet against a received contract draft. Your task is to find every clause where the received draft DEVIATES from what was agreed in the term sheet.

Focus on these clause types: Indemnity, Limitation of Liability, Non-Compete, Non-Solicit, Governing Law, Dispute Resolution/Arbitration, Representations & Warranties, Termination, Conditions Precedent, Confidentiality, Data Protection, Assignment, Audit Rights, Exclusivity, Most Favored Customer, Change of Control.

You must detect THREE types of deviations:
1. MODIFIED: A clause exists in both documents but the received draft changes the terms in a way that disadvantages our client
2. ADDED: A clause appears in the received draft that was NOT present in the term sheet at all. These are often sneaky insertions of unfavorable terms.
3. OMITTED: A clause was present in the term sheet but has been REMOVED entirely from the received draft. These are dangerous as they remove protections our client negotiated.

For ADDED clauses, set termSheetPosition to "Not present in term sheet — this clause was added by counterparty"
For OMITTED clauses, set receivedDraftPosition to "Removed from draft — this protection was deleted"

Output ONLY a valid JSON object. Do not include any text before or after the JSON. Do not wrap it in markdown code blocks. Just the raw JSON.

The JSON must follow this structure exactly:
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

export async function POST(request) {
  const startTime = Date.now()

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const { doc1Text, doc2Text } = await request.json()

    if (!doc1Text || !doc2Text) {
      return NextResponse.json(
        { error: 'Both documents are required for analysis' },
        { status: 400 }
      )
    }

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
      const errorText = await response.text()
      console.error('DeepSeek API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Analysis failed — DeepSeek returned ${response.status}` },
        { status: 500 }
      )
    }

    const data = await response.json()
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`DeepSeek response in ${elapsed}s`)

    let rawContent = (data.choices?.[0]?.message?.content || '').trim()
    if (rawContent.startsWith('```json')) {
      rawContent = rawContent.replace(/^```json\n?/, '').replace(/\n?```$/, '')
    } else if (rawContent.startsWith('```')) {
      rawContent = rawContent.replace(/^```\n?/, '').replace(/\n?```$/, '')
    }

    let parsed
    try {
      parsed = JSON.parse(rawContent)
    } catch {
      console.error('Failed to parse DeepSeek response:', rawContent.substring(0, 300))
      return NextResponse.json(
        { error: 'Could not parse AI response', raw: rawContent.substring(0, 200) },
        { status: 500 }
      )
    }

    const deviations = parsed.deviations || []
    console.log(`Found ${deviations.length} deviations`)

    return NextResponse.json({
      deviations,
      summary: {
        total: deviations.length,
        added: deviations.filter((d) => d.deviationType === 'Added').length,
        omitted: deviations.filter((d) => d.deviationType === 'Omitted').length,
        modified: deviations.filter((d) => d.deviationType === 'Modified').length,
        high: deviations.filter((d) => d.riskLevel === 'High').length,
        medium: deviations.filter((d) => d.riskLevel === 'Medium').length,
        low: deviations.filter((d) => d.riskLevel === 'Low').length,
      },
    })
  } catch (error) {
    console.error('Error in analyze API:', error)
    return NextResponse.json(
      { error: 'Analysis failed', details: error.message },
      { status: 500 }
    )
  }
}