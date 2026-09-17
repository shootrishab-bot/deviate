// ─── Model output schema ─────────────────────────────────────────────────────
//
// The model's JSON is validated before it reaches the UI or the .docx export.
// A response that does not match gets one corrective retry (see the batch
// route), and a pair whose output still fails is reported as a failed pair
// rather than silently dropping findings.

import { z } from 'zod'

const RISK_LEVELS = ['High', 'Medium', 'Low']
const DEVIATION_TYPES = ['Modified', 'Added', 'Omitted']

export const DeviationSchema = z.object({
  candidateId: z.string().max(40).nullish(),
  clauseName: z.string().trim().min(1).max(160),
  deviationType: z.enum(DEVIATION_TYPES),
  termSheetPosition: z.string().trim().min(1).max(2000),
  receivedDraftPosition: z.string().trim().min(1).max(2000),
  termSheetQuote: z.string().max(1500).default(''),
  receivedDraftQuote: z.string().max(1500).default(''),
  riskLevel: z.enum(RISK_LEVELS),
  explanation: z.string().trim().min(1).max(2000),
})

export const AnalysisSchema = z.object({
  deviations: z.array(DeviationSchema).max(200),
})

const titleCase = (value) =>
  typeof value === 'string' && value.length > 0
    ? value.trim().charAt(0).toUpperCase() + value.trim().slice(1).toLowerCase()
    : value

/**
 * Fix casing and missing optional fields before validation, so a retry is spent
 * on genuinely malformed output rather than on "HIGH" instead of "High".
 */
export function normalizeAnalysis(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.deviations)) return value
  return {
    ...value,
    deviations: value.deviations.map((d) => {
      if (!d || typeof d !== 'object') return d
      return {
        ...d,
        deviationType: titleCase(d.deviationType),
        riskLevel: titleCase(d.riskLevel),
        termSheetQuote: typeof d.termSheetQuote === 'string' ? d.termSheetQuote : '',
        receivedDraftQuote: typeof d.receivedDraftQuote === 'string' ? d.receivedDraftQuote : '',
      }
    }),
  }
}

/** Turn validation issues into a short instruction the model can act on. */
export function describeValidationError(error) {
  const issues = error?.issues || []
  if (issues.length === 0) return 'Response did not match the required JSON schema.'
  return issues
    .slice(0, 6)
    .map((issue) => {
      const path = issue.path?.length ? issue.path.join('.') : '(root)'
      return `${path}: ${issue.message}`
    })
    .join('; ')
}

/** @returns {{ok: true, data: object} | {ok: false, error: string}} */
export function validateAnalysis(value) {
  const result = AnalysisSchema.safeParse(normalizeAnalysis(value))
  if (result.success) return { ok: true, data: result.data }
  return { ok: false, error: describeValidationError(result.error) }
}
