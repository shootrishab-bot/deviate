// ─── Playbook helpers ────────────────────────────────────────────────────────

const STORAGE_KEY = 'deviate-playbook'

const DEFAULT_PLAYBOOK = [
  {
    id: 'indemnity',
    clauseType: 'Indemnity',
    preferredPosition: 'Mutual indemnity capped at contract value, with carve-outs for gross negligence and wilful misconduct.',
    dealbreaker: 'Unilateral broad indemnity with no cap.',
    suggestedResponse: 'We propose mutual indemnity with a cap equal to fees paid in the preceding 12 months. Happy to discuss carve-outs for IP infringement.',
  },
  {
    id: 'limitation-of-liability',
    clauseType: 'Limitation of Liability',
    preferredPosition: 'Liability cap at 100% of contract value. Exclusion of consequential, indirect, and punitive damages.',
    dealbreaker: 'Unlimited liability or removal of consequential loss exclusion.',
    suggestedResponse: 'Our standard position excludes consequential and indirect loss and caps aggregate liability at contract value. We can discuss a higher cap for data breaches.',
  },
  {
    id: 'non-compete',
    clauseType: 'Non-Compete',
    preferredPosition: 'Maximum 12 months post-termination, restricted to directly competing services in agreed territories.',
    dealbreaker: 'Non-compete exceeding 24 months or applying globally.',
    suggestedResponse: 'We can accept a 12-month non-compete restricted to [Territory]. A broader or longer restriction is not commercially acceptable.',
  },
  {
    id: 'governing-law',
    clauseType: 'Governing Law',
    preferredPosition: 'Laws of India, jurisdiction of Delhi or Bombay High Court.',
    dealbreaker: 'Foreign governing law without a compelling cross-border reason.',
    suggestedResponse: 'We propose Indian law (Delhi HC jurisdiction) as the parties and performance are India-based. Open to discuss if there is a specific reason for the proposed jurisdiction.',
  },
  {
    id: 'dispute-resolution',
    clauseType: 'Dispute Resolution / Arbitration',
    preferredPosition: 'SIAC or DIAC arbitration, seat in Singapore or Dubai, panel of one arbitrator for disputes under INR 5 crore.',
    dealbreaker: 'Litigation-only clause in a foreign court without mutual agreement.',
    suggestedResponse: 'We prefer institutional arbitration (SIAC/DIAC) with a Singapore seat. A three-member panel is disproportionate for disputes of this size; we propose a sole arbitrator.',
  },
  {
    id: 'confidentiality',
    clauseType: 'Confidentiality',
    preferredPosition: '3-year post-termination obligation, return or destroy on request, standard carve-outs for public domain and prior disclosure.',
    dealbreaker: 'Perpetual confidentiality obligation or unilateral definition of confidential information.',
    suggestedResponse: 'We accept a 3-year post-termination confidentiality period with standard carve-outs. A perpetual obligation is not commercially standard and we are not able to accept it.',
  },
  {
    id: 'termination',
    clauseType: 'Termination',
    preferredPosition: 'Termination for convenience on 30 days notice; termination for cause on 14 days cure period.',
    dealbreaker: 'No termination for convenience right for our client, or unreasonable lock-in.',
    suggestedResponse: 'We require a termination for convenience right on 30 days notice. We can discuss reasonable exit fees for early termination within the minimum term.',
  },
  {
    id: 'data-protection',
    clauseType: 'Data Protection',
    preferredPosition: 'Compliance with DPDP Act 2023 and applicable rules; data processing agreement if counterparty is a data processor; breach notification within 72 hours.',
    dealbreaker: 'No data protection obligations or breach notification window exceeding 7 days.',
    suggestedResponse: 'As a data fiduciary under the DPDP Act, we require a compliant DPA and a 72-hour breach notification window as a non-negotiable baseline.',
  },
]

export function getPlaybook() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PLAYBOOK
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_PLAYBOOK
  } catch {
    return DEFAULT_PLAYBOOK
  }
}

export function savePlaybook(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch (err) {
    console.error('Failed to save playbook:', err)
  }
}

/**
 * Find a playbook entry whose clauseType fuzzy-matches the AI-detected clauseName.
 */
export function findPlaybookMatch(clauseName, entries) {
  if (!clauseName || !entries?.length) return null
  const needle = clauseName.toLowerCase().replace(/[^a-z0-9]/g, '')
  return (
    entries.find((e) => {
      const haystack = e.clauseType.toLowerCase().replace(/[^a-z0-9]/g, '')
      return haystack.includes(needle) || needle.includes(haystack)
    }) || null
  )
}