'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getPlaybook, findPlaybookMatch } from '../lib/playbook'
import { saveBatch, getBatches, getBatch, deleteBatch, generateId } from '../lib/storage'

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const PHASES = {
  UPLOAD:    'upload',
  PAIRING:   'pairing',
  ANALYZING: 'analyzing',
  RESULTS:   'results',
  REVIEWS:   'reviews',
}

const LOADING_TIPS = [
  'Scanning for hidden clauses...',
  'Checking against your playbook...',
  'Mapping risk levels...',
  'Comparing term positions...',
  'Almost done — reviewing findings...',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isValidFileType = (file) => file && VALID_FILE_TYPES.includes(file.type)

const sanitizeFileName = (name = '') =>
  name.replace(/[^a-zA-Z0-9-_\. ]/g, '').replace(/\s+/g, '_').trim()

const abstractText = (text, maxLength = 120) => {
  if (typeof text !== 'string') return text || '—'
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

const isValidSuggestedResponse = (response) => {
  if (!response || typeof response !== 'string' || response.trim() === '') return false
  const t = response.trim()
  return (
    t !== 'No playbook entry configured yet' &&
    t !== 'No response configured' &&
    !t.includes('No playbook entry') &&
    !t.includes('No response configured')
  )
}

const filenameSimilarity = (a, b) => {
  const norm = (s) =>
    s.toLowerCase().replace(/\.(pdf|docx)$/i, '').replace(/[^a-z0-9]/g, '')
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return 0
  const longer = na.length > nb.length ? na : nb
  const shorter = na.length > nb.length ? nb : na
  if (longer.includes(shorter)) return shorter.length / longer.length
  let common = 0
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) common++
  }
  return common / longer.length
}

const buildAutoSuggestions = (firmDocs, counterpartyDocs) => {
  const pairs = {}
  const scores = {}
  firmDocs.forEach((fd) => {
    let best = null
    let bestScore = 0
    counterpartyDocs.forEach((cd) => {
      const score = filenameSimilarity(fd.name, cd.name)
      if (score > bestScore) { bestScore = score; best = cd.name }
    })
    pairs[fd.name] = bestScore > 0.3 ? best : null
    scores[fd.name] = bestScore
  })
  return { pairs, scores }
}

// ─── Theme hook ───────────────────────────────────────────────────────────────

function useTheme() {
  const [dark, setDark] = useState(true)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('deviate-theme')
      if (saved === 'light') { setDark(false); document.documentElement.classList.add('light') }
    } catch {}
  }, [])
  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev
      try {
        localStorage.setItem('deviate-theme', next ? 'dark' : 'light')
        if (next) document.documentElement.classList.remove('light')
        else document.documentElement.classList.add('light')
      } catch {}
      return next
    })
  }, [])
  return { dark, toggle }
}

// ─── Themed class helpers ─────────────────────────────────────────────────────

const tc = {
  bg:        'bg-[var(--bg)]',
  card:      'bg-[var(--bg-card)] border-[var(--border)]',
  cardAlt:   'bg-[var(--bg-card-alt)] border-[var(--border)]',
  input:     'bg-[var(--bg-input)] border-[var(--border)]',
  text:      'text-[var(--text-primary)]',
  textSec:   'text-[var(--text-secondary)]',
  textMuted: 'text-[var(--text-muted)]',
  border:    'border-[var(--border)]',
}

// ─── Keyboard shortcut hook ───────────────────────────────────────────────────

function useKeyboardShortcuts({ onNewAnalysis, onExport, onAnalyze, canAnalyze }) {
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); onNewAnalysis() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); onExport() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canAnalyze) { e.preventDefault(); onAnalyze() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onNewAnalysis, onExport, onAnalyze, canAnalyze])
}

// ─── Components ───────────────────────────────────────────────────────────────

function ThemeToggle({ dark, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex h-9 w-9 items-center justify-center rounded-2xl border transition-all duration-200 hover:scale-105 ${tc.card}`}
      aria-label="Toggle theme"
    >
      {dark ? (
        <svg className="h-4 w-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      ) : (
        <svg className="h-4 w-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
        </svg>
      )}
    </button>
  )
}

function ShortcutsPanel() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-medium transition-all duration-200 hover:scale-[1.02] ${tc.card} ${tc.textMuted}`}
      >
        <span>⌨</span>
        <span className="hidden sm:inline">Shortcuts</span>
      </button>
      {open && (
        <div className={`absolute right-0 top-11 z-50 min-w-[220px] rounded-2xl border p-4 shadow-2xl animate-scale-in ${tc.card}`}>
          <p className={`mb-3 text-xs font-semibold uppercase tracking-widest ${tc.textMuted}`}>Keyboard shortcuts</p>
          {[
            ['Ctrl + Enter', 'Analyze pairs'],
            ['Ctrl + E', 'Export report'],
            ['Ctrl + N', 'New analysis'],
          ].map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4 py-1">
              <span className={`text-xs ${tc.textSec}`}>{label}</span>
              <kbd className={`rounded px-2 py-0.5 text-[10px] font-mono font-semibold border ${tc.cardAlt} ${tc.textMuted}`}>{key}</kbd>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RiskBadge({ level }) {
  const cls =
    level === 'High'
      ? 'bg-[#FF4444]/10 text-[#FF4444] border border-[#FF4444]/20 shadow-[0_0_8px_rgba(255,68,68,0.15)]'
      : level === 'Medium'
      ? 'bg-[#FF6719]/10 text-[#FF6719] border border-[#FF6719]/20'
      : 'bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/20'
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {level || 'Unknown'}
    </span>
  )
}

function TypeBadge({ type }) {
  const cls =
    type === 'Added'
      ? 'bg-[#FF4444]/10 text-[#FF4444] border border-[#FF4444]/20'
      : type === 'Omitted'
      ? 'bg-[#FF6719]/10 text-[#FF6719] border border-[#FF6719]/20'
      : 'bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/20'
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase ${cls}`}>
      {type || 'Modified'}
    </span>
  )
}

function UploadZone({ label, subtitle, files, onAdd, onRemove }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = (incoming) => {
    const valid = Array.from(incoming).filter(isValidFileType)
    if (valid.length) onAdd(valid)
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        className={`cursor-pointer rounded-3xl border-2 border-dashed p-10 text-center transition-all duration-200 ${
          dragging
            ? 'border-[#1DB954] bg-[#1DB954]/5 shadow-lg shadow-green-900/20 glow-green'
            : `border-[var(--border)] bg-[var(--bg-input)] hover:border-[#1DB954]/40 hover:bg-[#1DB954]/[0.02]`
        }`}
      >
        <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-200 ${dragging ? 'bg-[#1DB954]/20 scale-110' : 'bg-[var(--bg-card-alt)]'}`}>
          <svg className={`h-6 w-6 transition-colors duration-200 ${dragging ? 'text-[#1DB954]' : 'text-[var(--text-muted)]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <p className={`text-sm font-semibold transition-colors duration-200 ${dragging ? 'text-[#1DB954]' : 'text-[var(--text-primary)]'}`}>{label}</p>
        <p className={`mt-1 text-xs ${tc.textMuted}`}>{subtitle}</p>
        <p className={`mt-2 text-xs transition-colors duration-200 ${dragging ? 'text-[#1DB954]' : tc.textMuted}`}>
          {dragging ? 'Drop files here' : 'Drag and drop or click to browse · PDF or DOCX'}
        </p>
        <input ref={inputRef} type="file" accept=".pdf,.docx" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>
      {files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className={`animate-scale-in flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm ${tc.card} text-[var(--text-primary)]`}>
              <span className="max-w-[160px] truncate font-medium">{f.name}</span>
              {f.chars != null && <span className={`text-xs ${tc.textMuted}`}>{f.chars.toLocaleString()} chars</span>}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(i) }}
                className={`ml-0.5 flex h-5 w-5 items-center justify-center rounded-full ${tc.textMuted} transition-all duration-150 hover:bg-[#FF4444]/10 hover:text-[#FF4444]`}
                aria-label={`Remove ${f.name}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RiskBarChart({ pairResults }) {
  const total = pairResults.reduce((acc, r) => acc + (r.summary?.total || 0), 0)
  const high   = pairResults.reduce((acc, r) => acc + (r.summary?.high   || 0), 0)
  const medium = pairResults.reduce((acc, r) => acc + (r.summary?.medium || 0), 0)
  const low    = pairResults.reduce((acc, r) => acc + (r.summary?.low    || 0), 0)

  if (total === 0) return null

  const bars = [
    { label: 'High', count: high,   color: '#FF4444', bg: 'bg-[#FF4444]' },
    { label: 'Medium', count: medium, color: '#FF6719', bg: 'bg-[#FF6719]' },
    { label: 'Low', count: low,    color: '#1DB954', bg: 'bg-[#1DB954]' },
  ]

  return (
    <div className={`rounded-3xl border p-6 space-y-4 ${tc.card}`}>
      <p className={`text-sm font-semibold ${tc.text}`}>Risk breakdown</p>
      <div className="space-y-3">
        {bars.map(({ label, count, color, bg }) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={label}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color }}>{label}</span>
                <span className="text-xs font-bold" style={{ color }}>{count} <span className={`font-normal ${tc.textMuted}`}>({pct}%)</span></span>
              </div>
              <div className={`h-2 w-full rounded-full bg-[var(--bg-card-alt)]`}>
                <div
                  className={`h-2 rounded-full bar-animated transition-all duration-700 ${bg}`}
                  style={{ width: `${pct}%`, '--bar-width': `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className={`pt-1 border-t border-[var(--border)] flex items-center justify-between`}>
        <span className={`text-xs ${tc.textMuted}`}>Total deviations</span>
        <span className={`text-sm font-bold ${tc.text}`}>{total}</span>
      </div>
    </div>
  )
}

function ExportPreviewModal({ result, onConfirm, onClose, exporting }) {
  const { doc1Name, doc2Name, summary, deviations } = result
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-3xl border p-8 animate-scale-in shadow-2xl ${tc.card}`}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className={`text-lg font-bold ${tc.text}`}>Export preview</p>
            <p className={`text-xs mt-0.5 ${tc.textMuted}`}>Review what goes into your report</p>
          </div>
          <button type="button" onClick={onClose} className={`h-8 w-8 flex items-center justify-center rounded-full text-lg hover:bg-[#FF4444]/10 hover:text-[#FF4444] ${tc.textMuted} transition-all`}>&times;</button>
        </div>

        <div className={`rounded-2xl border p-5 space-y-3 bg-[var(--bg-input)] border-[var(--border)]`}>
          <p className={`text-xs font-semibold uppercase tracking-widest ${tc.textMuted}`}>Report contents</p>
          {[
            { icon: '📄', label: 'Cover Page', sub: 'Matter title, date, review signature line' },
            { icon: '📊', label: 'Executive Summary', sub: `${summary.total} deviations · ${summary.high} high · ${summary.medium} med · ${summary.low} low` },
            { icon: '⚠️', label: 'Detailed Findings Table', sub: `${deviations.length} rows with risk, type, positions, playbook response` },
            { icon: '⚖️', label: 'Disclaimer', sub: 'AI-assisted analysis, requires counsel review' },
          ].map(({ icon, label, sub }) => (
            <div key={label} className="flex items-start gap-3">
              <span className="mt-0.5 text-base">{icon}</span>
              <div>
                <p className={`text-sm font-semibold ${tc.text}`}>{label}</p>
                <p className={`text-xs ${tc.textMuted}`}>{sub}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={`mt-4 rounded-2xl border p-4 space-y-1 bg-[var(--bg-input)] border-[var(--border)]`}>
          <p className={`text-xs font-semibold uppercase tracking-widest ${tc.textMuted}`}>Matter</p>
          <p className={`text-sm font-medium truncate ${tc.text}`}>{doc2Name}</p>
          <p className={`text-xs ${tc.textMuted}`}>vs {doc1Name}</p>
        </div>

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition-all duration-200 hover:scale-[1.01] ${tc.cardAlt} ${tc.textSec} border-[var(--border)]`}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={exporting}
            className="flex-1 rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-green-900/20 transition-all duration-200 hover:shadow-green-900/40 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
          >
            {exporting ? 'Generating...' : 'Download .docx'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CelebrationOverlay({ visible }) {
  if (!visible) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center">
      <div className="celebration-flash flex flex-col items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#1DB954]/20 glow-green">
          <svg className="h-12 w-12 text-[#1DB954]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <p className="text-2xl font-extrabold text-white tracking-tight">Analysis complete</p>
      </div>
    </div>
  )
}

function AnalyzingScreen({ total, done, currentTip }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <section className={`animate-fade-in-up space-y-6 rounded-3xl border p-10 ${tc.card}`}>
      <div className="flex flex-col items-center text-center gap-5">
        {/* Animated pulse */}
        <div className="relative flex items-center justify-center">
          <div className="absolute h-24 w-24 rounded-full bg-[#1DB954]/20 glow-green" />
          <div className="absolute h-16 w-16 rounded-full bg-[#1DB954]/30" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#1DB954]">
            <svg className="animate-spin-slow h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/>
            </svg>
          </div>
        </div>

        <div>
          <h2 className={`text-2xl font-extrabold tracking-tight ${tc.text}`}>Analyzing documents</h2>
          <p className={`mt-1 text-sm ${tc.textSec}`}>Running AI analysis on {total} pair{total !== 1 ? 's' : ''}. Hang tight.</p>
        </div>

        {/* Progress */}
        <div className="w-full max-w-sm">
          <div className="mb-3 flex items-end justify-between">
            <span className={`text-sm ${tc.textSec}`}>{done} of {total} complete</span>
            <span className="text-2xl font-extrabold text-[#1DB954]">{pct}%</span>
          </div>
          <div className={`h-3 w-full rounded-full bg-[var(--bg-card-alt)]`}>
            <div
              className={`h-3 rounded-full transition-all duration-500 ${done < total ? 'progress-shimmer' : 'bg-[#1DB954]'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Rotating tip */}
        <p key={currentTip} className={`animate-tip-fade text-sm italic ${tc.textMuted}`}>
          {currentTip}
        </p>
      </div>

      {/* Per-pair status */}
      <div className="space-y-2 mt-4">
        {Array.from({ length: total }).map((_, i) => {
          const pair = { status: 'analyzing' }
          return (
            <div key={i} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${tc.cardAlt}`}>
              <span className={`text-xs font-bold w-5 text-center ${tc.textMuted}`}>{i + 1}</span>
              <span className={`flex-1 text-sm ${tc.textSec}`}>Pair {i + 1}</span>
              <span className="animate-pulse rounded-full border border-[#1DB954]/20 bg-[#1DB954]/10 px-3 py-0.5 text-xs font-semibold text-[#1DB954]">Analyzing...</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SidebarCard({ title, children }) {
  return (
    <div className={`rounded-3xl border p-5 ${tc.card}`}>
      {title && <p className={`mb-3 text-sm font-semibold tracking-tight ${tc.text}`}>{title}</p>}
      <div className={`text-sm space-y-2 ${tc.textSec}`}>{children}</div>
    </div>
  )
}

function UploadSidebar({ firmCount, cpCount }) {
  const hasFiles = firmCount > 0 || cpCount > 0
  if (hasFiles) {
    return (
      <div className="space-y-3 animate-fade-in-up">
        <SidebarCard title="Files loaded">
          <p className="font-semibold text-[#1DB954]">
            {firmCount} firm doc{firmCount !== 1 ? 's' : ''}, {cpCount} counterparty doc{cpCount !== 1 ? 's' : ''}
          </p>
          <p>Upload on both sides to pair them up.</p>
        </SidebarCard>
        <SidebarCard title="What happens next">
          <p>You&apos;ll pair each firm document with its counterparty version. We suggest matches by filename.</p>
        </SidebarCard>
        {firmCount > 0 && cpCount > 0 && (
          <div className="flex items-center gap-3 rounded-3xl border border-[#1DB954]/20 bg-[#1DB954]/5 p-4">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#1DB954] text-black text-xs font-bold">✓</div>
            <p className="text-sm font-semibold text-[#1DB954]">Both sides loaded. Ready to pair.</p>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-3 animate-fade-in-up">
      <SidebarCard title="What is Deviate?">
        <p>Opposing counsel didn&apos;t delete a clause by accident. Deviate catches every omission, addition, and modification, then tells you the commercial consequence and how to respond, based on your firm&apos;s standard positions.</p>
      </SidebarCard>
      <SidebarCard title="How it works">
        <ol className="space-y-3 list-none">
          {[
            "Upload your firm's docs and the counterparty versions",
            'Pair them — we suggest the obvious matches',
            'Get every deviation flagged with your response ready to go',
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#1DB954] text-black text-xs font-bold">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </SidebarCard>
      <SidebarCard title="Quick tips">
        <ul className="space-y-1.5">
          {['Text-based PDFs give the best results', 'DOCX files work great too', 'Upload multiple files at once', 'Very large files (60+ pages) may take longer'].map((tip, i) => (
            <li key={i} className="flex gap-2"><span className="mt-0.5 text-[#1DB954]">·</span><span>{tip}</span></li>
          ))}
        </ul>
      </SidebarCard>
    </div>
  )
}

function PairingSidebar({ confirmedCount }) {
  return (
    <div className="space-y-3 animate-fade-in-up">
      <SidebarCard title="Smart pairing">
        <ul className="space-y-1.5">
          {[
            'We matched your docs by filename similarity',
            'Use the dropdown to swap any suggestion',
            "Skip docs you don't need analyzed",
            'Go back to upload to add more files',
          ].map((tip, i) => (
            <li key={i} className="flex gap-2"><span className="mt-0.5 text-[#1DB954]">·</span><span>{tip}</span></li>
          ))}
        </ul>
      </SidebarCard>
      <SidebarCard>
        <div className="flex items-end gap-2">
          <span className="text-5xl font-extrabold text-[#1DB954] tracking-tight">{confirmedCount}</span>
          <p className={`mb-1 ${tc.textSec}`}>pair{confirmedCount !== 1 ? 's' : ''} ready</p>
        </div>
      </SidebarCard>
    </div>
  )
}

function ResultsSidebar({ pairResults, onNewAnalysis }) {
  return (
    <div className="space-y-3 animate-fade-in-up">
      <RiskBarChart pairResults={pairResults} />
      <SidebarCard>
        <button
          type="button"
          onClick={onNewAnalysis}
          className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold text-left transition-all duration-200 hover:border-[#1DB954]/30 hover:text-[#1DB954] ${tc.cardAlt} border-[var(--border)]`}
        >
          Start new analysis
        </button>
      </SidebarCard>
    </div>
  )
}

function DetailSidebar({ deviations, activeFilter, onFilterChange }) {
  const counts = {
    all:      deviations.length,
    Added:    deviations.filter((d) => d.deviationType === 'Added').length,
    Omitted:  deviations.filter((d) => d.deviationType === 'Omitted').length,
    Modified: deviations.filter((d) => d.deviationType === 'Modified').length,
  }
  return (
    <div className="space-y-3 animate-fade-in-up">
      <SidebarCard title="Filter by type">
        <div className="mt-1 flex flex-col gap-2">
          {[
            { key: null,       label: `All (${counts.all})` },
            { key: 'Added',    label: `Added (${counts.Added})` },
            { key: 'Omitted',  label: `Omitted (${counts.Omitted})` },
            { key: 'Modified', label: `Modified (${counts.Modified})` },
          ].map(({ key, label }) => (
            <button
              key={String(key)}
              type="button"
              onClick={() => onFilterChange(key)}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold text-left transition-all duration-300 ${
                activeFilter === key
                  ? 'bg-gradient-to-r from-[#1DB954] to-[#169C46] text-white border-transparent shadow-lg shadow-green-900/30'
                  : `border ${tc.card} ${tc.textSec} hover:border-[#1DB954]/50 hover:text-[#1DB954]`
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </SidebarCard>
    </div>
  )
}

function PairingSummaryCard({ pair, onViewDetail, onExportPreview, exporting }) {
  const { doc1Name, doc2Name, summary, status, error } = pair
  return (
    <div className={`rounded-3xl border p-6 transition-all duration-300 hover:border-[#1DB954]/20 hover:shadow-xl hover:shadow-green-900/10 hover:-translate-y-1 ${tc.card}`}>
      <div className="flex flex-col gap-4">
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${tc.text}`}>{doc2Name}</p>
          <p className={`mt-0.5 truncate text-xs ${tc.textMuted}`}>compared with {doc1Name}</p>
        </div>
        {status === 'analyzing' && (
          <span className="shrink-0 animate-pulse rounded-full border border-[#1DB954]/20 bg-[#1DB954]/10 px-3 py-1 text-xs font-semibold text-[#1DB954]">Analyzing...</span>
        )}
        {status === 'error' && (
          <span className="shrink-0 rounded-full border border-[#FF4444]/20 bg-[#FF4444]/10 px-3 py-1 text-xs font-semibold text-[#FF4444]">Failed</span>
        )}
        {status === 'complete' && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tc.textSec} border-[var(--border)]`}>{summary.total} total</span>
            <span className="rounded-full border border-[#FF4444]/20 bg-[#FF4444]/10 px-2.5 py-1 text-xs font-semibold text-[#FF4444]">{summary.high} high</span>
            <span className="rounded-full border border-[#FF6719]/20 bg-[#FF6719]/10 px-2.5 py-1 text-xs font-semibold text-[#FF6719]">{summary.medium} med</span>
            <span className="rounded-full border border-[#1DB954]/20 bg-[#1DB954]/10 px-2.5 py-1 text-xs font-semibold text-[#1DB954]">{summary.low} low</span>
          </div>
        )}
      </div>
      {error && <p className="mt-3 text-xs text-[#FF4444]">{error}</p>}
      {status === 'complete' && (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onViewDetail}
            className="rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-green-900/20 transition-all duration-200 hover:shadow-green-900/40 hover:scale-[1.02] active:scale-[0.98]"
          >
            View details
          </button>
          <button
            type="button"
            onClick={onExportPreview}
            disabled={exporting}
            className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition-all duration-200 hover:border-[#333] hover:text-[#1DB954] disabled:opacity-40 ${tc.cardAlt} ${tc.textSec} border-[var(--border)]`}
          >
            {exporting ? 'Generating...' : 'Export report'}
          </button>
        </div>
      )}
    </div>
  )
}

function DeviationTable({ deviations, playbookEntries, activeFilter, activeRiskFilter }) {
  const [copiedIndex, setCopiedIndex] = useState(null)

  const augmented = deviations.map((d) => {
    const match = findPlaybookMatch(d.clauseName, playbookEntries)
    return {
      ...d,
      playbookPosition: match?.preferredPosition || 'No playbook entry configured yet',
      suggestedResponse: match?.suggestedResponse || 'No response configured',
      hasPlaybookMatch: Boolean(match),
    }
  })

  const displayed = augmented.filter((d) => {
    if (activeFilter && d.deviationType !== activeFilter) return false
    if (activeRiskFilter && d.riskLevel !== activeRiskFilter) return false
    return true
  })

  const handleCopy = async (index, text) => {
    if (!text || !navigator?.clipboard) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch {}
  }

  if (displayed.length === 0) {
    return (
      <div className="rounded-3xl border border-[#1DB954]/20 bg-[#1DB954]/5 p-6 text-sm text-[#1DB954]">
        No deviations of this type found.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {(activeFilter || activeRiskFilter) && (
        <p className={`text-xs ${tc.textMuted}`}>
          Showing {displayed.length} of {augmented.length} deviations
          {activeRiskFilter ? ` · ${activeRiskFilter} risk` : ''}
          {activeFilter ? ` · ${activeFilter} only` : ''}
        </p>
      )}

      {/* ── Desktop table ── */}
      <div className={`hidden lg:block overflow-x-auto rounded-3xl border ${tc.card} bg-[var(--bg-input)]`}>
        <table className={`min-w-full divide-y divide-[var(--border)] text-left text-sm`}>
          <thead>
            <tr className={`bg-[var(--bg-card-alt)]`}>
              {['#', 'Clause', 'Term Sheet Position', 'Received Draft', 'Risk', 'Explanation', 'Our Position', 'Suggested Response'].map((h) => (
                <th key={h} className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-widest ${tc.textMuted}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className={`divide-y divide-[var(--border)]`}>
            {displayed.map((d, i) => (
              <tr key={`${d.clauseName}-${i}`} className="transition-colors hover:bg-[#1DB954]/[0.03]">
                <td className={`px-5 py-4 align-top text-sm ${tc.textMuted}`}>{i + 1}</td>
                <td className={`px-5 py-4 align-top font-semibold ${tc.text}`}>
                  <div className="flex flex-col gap-1.5">
                    <span>{d.clauseName || '—'}</span>
                    <TypeBadge type={d.deviationType} />
                  </div>
                </td>
                <td className={`px-5 py-4 align-top whitespace-pre-wrap ${tc.textSec}`}>{abstractText(d.termSheetPosition)}</td>
                <td className={`px-5 py-4 align-top whitespace-pre-wrap ${tc.textSec}`}>{abstractText(d.receivedDraftPosition)}</td>
                <td className="px-5 py-4 align-top"><RiskBadge level={d.riskLevel} /></td>
                <td className={`px-5 py-4 align-top whitespace-pre-wrap ${tc.textSec}`}>{abstractText(d.explanation || 'No explanation provided', 140)}</td>
                <td className={`px-5 py-4 align-top whitespace-pre-wrap ${tc.textSec}`}>{abstractText(d.playbookPosition || 'No position available', 140)}</td>
                <td className={`px-5 py-4 align-top whitespace-pre-wrap ${tc.textSec}`}>
                  {isValidSuggestedResponse(d.suggestedResponse) ? (
                    <div className="space-y-2">
                      <p>{abstractText(d.suggestedResponse, 140)}</p>
                      <button
                        type="button"
                        onClick={() => handleCopy(i, d.suggestedResponse)}
                        className={`inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
                          copiedIndex === i
                            ? 'bg-[#1DB954]/20 text-[#1DB954] scale-95'
                            : 'bg-[var(--bg-card-alt)] text-[var(--text-secondary)] hover:bg-[#1DB954]/10 hover:text-[#1DB954]'
                        }`}
                      >
                        {copiedIndex === i ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  ) : (
                    <p className={`text-xs italic ${tc.textMuted}`}>No response configured</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards ── */}
      <div className="lg:hidden space-y-3">
        {displayed.map((d, i) => (
          <div key={`mobile-${d.clauseName}-${i}`} className={`rounded-2xl border p-4 space-y-3 ${tc.card}`}>
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold ${tc.textMuted}`}>{i + 1}</span>
                  <span className={`text-sm font-bold ${tc.text}`}>{d.clauseName || '—'}</span>
                </div>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  <TypeBadge type={d.deviationType} />
                  <RiskBadge level={d.riskLevel} />
                </div>
              </div>
            </div>

            {/* Position comparison */}
            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-xl p-3 bg-[var(--bg-card-alt)]`}>
                <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1 ${tc.textMuted}`}>Term Sheet</p>
                <p className={`text-xs ${tc.textSec}`}>{abstractText(d.termSheetPosition, 100)}</p>
              </div>
              <div className={`rounded-xl p-3 bg-[var(--bg-card-alt)]`}>
                <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1 ${tc.textMuted}`}>Received Draft</p>
                <p className={`text-xs ${tc.textSec}`}>{abstractText(d.receivedDraftPosition, 100)}</p>
              </div>
            </div>

            {/* Explanation */}
            {d.explanation && (
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1 ${tc.textMuted}`}>Consequence</p>
                <p className={`text-xs ${tc.textSec}`}>{abstractText(d.explanation, 160)}</p>
              </div>
            )}

            {/* Suggested response */}
            {isValidSuggestedResponse(d.suggestedResponse) && (
              <div className={`rounded-xl border border-[#1DB954]/20 bg-[#1DB954]/5 p-3`}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#1DB954] mb-1">Suggested Response</p>
                <p className={`text-xs ${tc.textSec} mb-2`}>{abstractText(d.suggestedResponse, 160)}</p>
                <button
                  type="button"
                  onClick={() => handleCopy(i, d.suggestedResponse)}
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200 ${
                    copiedIndex === i
                      ? 'bg-[#1DB954]/20 text-[#1DB954]'
                      : 'bg-[var(--bg-card-alt)] text-[var(--text-secondary)]'
                  }`}
                >
                  {copiedIndex === i ? '✓ Copied' : 'Copy response'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}




// ─── About Modal ─────────────────────────────────────────────────────────────

function AboutModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('about')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg h-[95vh] sm:max-h-[80vh] sm:h-auto flex flex-col rounded-3xl border shadow-2xl animate-scale-in ${tc.card}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 sm:px-8 py-5 sm:py-6 border-b border-[var(--border)] flex-shrink-0`}>
          <div>
            <p className={`text-lg font-bold tracking-tight ${tc.text}`}>Deviate</p>
            <p className={`text-xs mt-0.5 ${tc.textMuted}`}>Built by a lawyer, for lawyers</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`h-8 w-8 flex items-center justify-center rounded-full text-lg transition-all hover:bg-[#FF4444]/10 hover:text-[#FF4444] ${tc.textMuted}`}
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 sm:px-8 pt-4 flex-shrink-0">
          {[
            { key: 'about',   label: 'About' },
            { key: 'contact', label: 'Contact' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
                activeTab === key
                  ? 'bg-gradient-to-r from-[#1DB954] to-[#169C46] text-white shadow-lg shadow-green-900/20'
                  : `border ${tc.card} ${tc.textMuted} hover:text-[#1DB954] border-[var(--border)]`
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 sm:px-8 py-5 sm:py-6 space-y-4">

          {/* ABOUT TAB */}
          {activeTab === 'about' && (
            <div className="space-y-4">
              {/* Bio card */}
              <div className={`rounded-2xl border p-5 bg-[var(--bg-card-alt)] border-[var(--border)]`}>
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#1DB954]/10">
                    <span className="text-xl font-extrabold text-[#1DB954]">R</span>
                  </div>
                  <div>
                    <p className={`text-base font-bold ${tc.text}`}>Rishab Ramakrishna</p>
                    <p className={`text-xs mt-0.5 ${tc.textMuted}`}>B.B.A. LL.B. (Hons.) — Jindal Global Law School</p>
                    <p className={`text-xs mt-0.5 text-[#1DB954]`}>Technology Law · Data Privacy · Commercial Contracts</p>
                  </div>
                </div>
              </div>

              {/* Story */}
              <div className={`rounded-2xl border p-5 bg-[var(--bg-card-alt)] border-[var(--border)]`}>
                <p className={`text-sm font-bold mb-2 ${tc.text}`}>Why Deviate?</p>
                <p className={`text-xs leading-relaxed ${tc.textSec}`}>
                  Contract review is one of the most time-intensive tasks in any commercial practice. During internships across corporate and fintech teams, the process was the same everywhere: open both documents, scroll line by line, manually flag differences, then draft a response from scratch. A task that consumed hours of a junior associate&apos;s time, every single time, for output that followed the same structure regardless of who did it.
                </p>
                <p className={`text-xs leading-relaxed mt-2 ${tc.textSec}`}>
                  Deviate was built to close that gap. It reads the legal meaning behind each change, not just the words, maps every deviation to a risk level, and surfaces your firm&apos;s standard negotiation position automatically. What previously took hours now takes under a minute, whether you are a first-year associate or a senior partner reviewing a counterparty&apos;s markup.
                </p>
                <p className={`text-xs leading-relaxed mt-2 ${tc.textSec}`}>
                  This is my first legal tech project. A second tool is currently in development and will be deployed very soon.
                </p>
              </div>

              {/* Background */}
              <div className={`rounded-2xl border p-5 bg-[var(--bg-card-alt)] border-[var(--border)]`}>
                <p className={`text-sm font-bold mb-3 ${tc.text}`}>Background</p>
                <div className="space-y-2.5">
                  {[
                    { org: 'TLP Advisors', role: 'Technology Law — UAE', detail: 'Virtual asset licensing, AML/CFT compliance, governance policy drafting' },
                    { org: 'Zepto', role: 'Contracts Team — Bangalore', detail: 'High-volume commercial contract review, risk flagging, bespoke clause drafting' },
                    { org: 'Khaitan & Co.', role: 'Banking & Fintech — Bangalore', detail: 'RBI regulatory compliance, cross-border fintech, payment orchestration analysis' },
                    { org: 'MD&T Partners', role: 'Corporate — Bangalore', detail: 'Share allotments, Section 8 incorporation, CCI merger thresholds' },
                  ].map(({ org, role, detail }) => (
                    <div key={org} className={`flex gap-3 pb-2.5 border-b border-[var(--border)] last:border-0 last:pb-0`}>
                      <div className="flex-shrink-0 mt-0.5 h-1.5 w-1.5 rounded-full bg-[#1DB954] mt-1.5" />
                      <div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className={`text-xs font-bold ${tc.text}`}>{org}</span>
                          <span className={`text-[10px] ${tc.textMuted}`}>{role}</span>
                        </div>
                        <p className={`text-[11px] mt-0.5 ${tc.textMuted}`}>{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Publications */}
              <div className={`rounded-2xl border p-5 bg-[var(--bg-card-alt)] border-[var(--border)]`}>
                <p className={`text-sm font-bold mb-2 ${tc.text}`}>Research &amp; Publications</p>
                <div className="space-y-2">
                  {[
                    '"Beyond Privacy: Framing Coercive Data Collection as Antitrust Harm in CCI v. Meta Platforms" — Indian Journal for Law and Legal Research',
                    'Virtual Asset Regulation Report on Digital Asset Classification under the FIT21 Act — distributed to industry stakeholders and high capital investors via PYOR',
                  ].map((pub, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="flex-shrink-0 text-[#1DB954] text-xs mt-0.5">◆</span>
                      <p className={`text-xs leading-relaxed ${tc.textSec}`}>{pub}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CONTACT TAB */}
          {activeTab === 'contact' && (
            <div className="space-y-4">
              <div className={`rounded-2xl border p-5 bg-[var(--bg-card-alt)] border-[var(--border)]`}>
                <p className={`text-sm font-bold mb-1 ${tc.text}`}>Get in touch</p>
                <p className={`text-xs leading-relaxed ${tc.textSec}`}>
                  For enquiries about Deviate, access requests, feedback, or collaboration, reach out directly. Response time is typically within 24 hours.
                </p>
              </div>

              {/* Contact links */}
              <div className="space-y-3">
                <a
                  href="mailto:rishabrsid@gmail.com"
                  className={`flex items-center gap-4 rounded-2xl border p-4 transition-all duration-200 hover:border-[#1DB954]/30 hover:bg-[#1DB954]/[0.03] group bg-[var(--bg-card-alt)] border-[var(--border)]`}
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#1DB954]/10 group-hover:bg-[#1DB954]/20 transition-colors">
                    <svg className="h-5 w-5 text-[#1DB954]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </div>
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-widest ${tc.textMuted}`}>Email</p>
                    <p className={`text-sm font-medium mt-0.5 ${tc.text}`}>rishabrsid@gmail.com</p>
                  </div>
                  <svg className={`h-4 w-4 ml-auto ${tc.textMuted} group-hover:text-[#1DB954] transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </a>

                <a
                  href="https://www.linkedin.com/in/rishab-ramakrishna-ab3b46228/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-4 rounded-2xl border p-4 transition-all duration-200 hover:border-[#0A66C2]/30 hover:bg-[#0A66C2]/[0.03] group bg-[var(--bg-card-alt)] border-[var(--border)]`}
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#0A66C2]/10 group-hover:bg-[#0A66C2]/20 transition-colors">
                    <svg className="h-5 w-5 text-[#0A66C2]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  </div>
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-widest ${tc.textMuted}`}>LinkedIn</p>
                    <p className={`text-sm font-medium mt-0.5 ${tc.text}`}>Rishab Ramakrishna</p>
                  </div>
                  <svg className={`h-4 w-4 ml-auto ${tc.textMuted} group-hover:text-[#0A66C2] transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </a>
              </div>

              <div className={`rounded-2xl border p-4 border-[#1DB954]/20 bg-[#1DB954]/5`}>
                <p className={`text-xs leading-relaxed text-[#1DB954]/80`}>
                  Deviate is currently in active development. Feedback from legal professionals on accuracy, workflow fit, and feature requests is especially welcome.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Mobile Menu ──────────────────────────────────────────────────────────────

function MobileMenu({ dark, phase, onNewAnalysis, onReviews, onGuide, onAbout }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 w-9 items-center justify-center rounded-2xl border transition-all duration-200 ${tc.card}`}
        aria-label="Menu"
      >
        <svg className={`h-4 w-4 ${tc.textMuted}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {open
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          }
        </svg>
      </button>
      {open && (
        <div className={`absolute right-0 top-11 z-50 w-52 rounded-2xl border shadow-2xl animate-scale-in ${tc.card}`}>
          {[
            { label: 'New Analysis', action: () => { onNewAnalysis(); setOpen(false) } },
            { label: 'My Reviews',   action: () => { onReviews();    setOpen(false) } },
            { label: 'Playbook',     href: '/playbook' },
            { label: 'How it works', action: () => { onGuide();      setOpen(false) } },
            { label: 'About',        action: () => { onAbout();      setOpen(false) } },
          ].map(({ label, action, href }) =>
            href ? (
              <a key={label} href={href} className={`block px-4 py-3 text-sm font-medium border-b border-[var(--border)] last:border-0 ${tc.textSec} hover:text-[#1DB954]`}>{label}</a>
            ) : (
              <button key={label} type="button" onClick={action} className={`w-full text-left px-4 py-3 text-sm font-medium border-b border-[var(--border)] last:border-0 ${tc.textSec} hover:text-[#1DB954]`}>{label}</button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ─── Guide Modal ──────────────────────────────────────────────────────────────

const GUIDE_STEPS = [
  {
    number: '01',
    title: 'Upload Your Documents',
    description: "Upload your firm's original document (term sheet, NDA, or agreement) and the counterparty's marked-up version. Deviate accepts PDF and DOCX files. You may upload multiple documents on each side simultaneously — for instance, all documents in a matter at once.",
    detail: "Supported formats: PDF (text-based) and DOCX. Redlined DOCX files with pending tracked changes are supported natively and do not need to be accepted before upload. If uploading a PDF of a redlined document, export it with revisions accepted rather than with markup visible, as strikethroughs and insertion marks in a PDF are read as plain text and will confuse the analysis. Scanned PDFs without embedded text may produce incomplete results.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Pair the Documents',
    description: 'Deviate automatically suggests which firm document corresponds to which counterparty document, based on filename similarity. A confidence score is shown for each suggested pairing.',
    detail: "You may override any suggestion using the dropdown menu. Documents you do not wish to analyse in this session can be skipped individually — they will not be removed from your upload.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'AI Analysis',
    description: "Deviate's AI engine reads both documents and identifies every point where the counterparty's draft deviates from the agreed position. This is not a word-for-word comparison — the AI understands legal meaning and commercial context.",
    detail: "The analysis detects three categories of deviation: Modified (a clause exists in both but the terms have changed), Added (a new clause inserted by the counterparty that was not in your original), and Omitted (a clause present in your document that has been removed).",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21a48.309 48.309 0 01-8.135-.687c-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
  },
  {
    number: '04',
    title: 'Review the Findings',
    description: "Results are presented in a structured deviation table. Each row identifies the clause, the type of deviation, what your document said, what the counterparty's draft says, a risk rating, and a plain-English explanation of the commercial consequence.",
    detail: "Use the filter buttons — High, Medium, Low risk, or by deviation type — to focus your review. The \"Our Position\" column draws from your firm's Playbook. The \"Suggested Response\" column provides pre-drafted negotiation language ready to copy and send.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
  },
  {
    number: '05',
    title: 'Export the Report',
    description: "Generate a professional Word document (.docx) report for each document pair. The report includes a cover page, an executive summary with a risk breakdown, the full findings table with playbook positions and suggested responses, and a legal disclaimer.",
    detail: "Reports are formatted for immediate use in client communications or internal matter files. The cover page includes a reviewed-by signature line. All generated reports are attorney work product and should be reviewed by instructed counsel before use.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
]

const GUIDE_FAQS = [
  {
    q: "What types of documents does Deviate work with?",
    a: "Deviate is designed for Indian corporate law documents including term sheets, NDAs, vendor agreements, shareholder agreements, employment contracts, and any other bilateral commercial agreements. It performs best on structured legal documents with clearly delineated clauses.",
  },
  {
    q: "How accurate is the AI analysis?",
    a: "Deviate is trained to identify material deviations in standard Indian corporate law clause types. It is highly accurate for common clauses such as indemnity, limitation of liability, non-compete, governing law, and dispute resolution. All output should be reviewed by a qualified legal professional before reliance. Deviate is a tool to accelerate review, not replace it.",
  },
  {
    q: "What is the Playbook and how do I configure it?",
    a: "The Playbook is your firm's internal library of standard positions on common clause types. For each clause type, you can define your preferred position, what constitutes a dealbreaker, and suggested negotiation language. When Deviate identifies a deviation, it matches the clause against your Playbook and surfaces the relevant position and response automatically. Navigate to the Playbook page from the header to configure your entries.",
  },
  {
    q: "Are my documents stored or shared?",
    a: "Documents are processed in memory during analysis and are not stored on Deviate's servers. Saved reviews are stored locally in your browser's storage and are not accessible to any other user or device. For matters involving highly sensitive documents, we recommend reviewing your firm's data handling policies before use.",
  },
  {
    q: "Can I analyse multiple document pairs at once?",
    a: "Yes. You may upload multiple firm documents and multiple counterparty documents simultaneously. In the pairing step, each firm document is matched to its counterparty version. All confirmed pairs are analysed in a single batch and results are presented together in the results dashboard.",
  },
  {
    q: "What do the risk levels mean?",
    a: "High risk indicates a deviation with significant potential commercial or legal consequence — for example, removal of a liability cap or insertion of an unlimited indemnity. Medium risk covers deviations that are meaningful but negotiable. Low risk covers minor variations that are unlikely to materially affect the transaction. Risk levels are assigned by the AI based on the nature of the clause and the extent of the change.",
  },
]

function GuideModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('walkthrough')
  const [openFaq, setOpenFaq] = useState(null)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-2xl h-[95vh] sm:max-h-[88vh] sm:h-auto flex flex-col rounded-3xl border shadow-2xl animate-scale-in ${tc.card}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 sm:px-8 py-5 sm:py-6 border-b border-[var(--border)] flex-shrink-0`}>
          <div>
            <p className={`text-lg font-bold tracking-tight ${tc.text}`}>How Deviate Works</p>
            <p className={`text-xs mt-0.5 ${tc.textMuted}`}>A guide for legal professionals</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`h-8 w-8 flex items-center justify-center rounded-full text-lg transition-all hover:bg-[#FF4444]/10 hover:text-[#FF4444] ${tc.textMuted}`}
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className={`flex gap-1 px-5 sm:px-8 pt-4 flex-shrink-0`}>
          {[
            { key: 'walkthrough', label: 'Step-by-step guide' },
            { key: 'playbook',    label: 'The Playbook' },
            { key: 'faq',        label: 'FAQs' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
                activeTab === key
                  ? 'bg-gradient-to-r from-[#1DB954] to-[#169C46] text-white shadow-lg shadow-green-900/20'
                  : `border ${tc.card} ${tc.textMuted} hover:text-[#1DB954] border-[var(--border)]`
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 sm:px-8 py-5 sm:py-6 space-y-5">

          {/* WALKTHROUGH TAB */}
          {activeTab === 'walkthrough' && (
            <div className="space-y-4">
              <p className={`text-xs leading-relaxed ${tc.textSec}`}>
                Deviate accelerates contract review by identifying every point at which a counterparty&apos;s draft deviates from an agreed position, assigning a risk rating to each deviation, and surfacing your firm&apos;s standard negotiation response automatically.
              </p>
              {GUIDE_STEPS.map((step) => (
                <div key={step.number} className={`rounded-2xl border p-5 bg-[var(--bg-card-alt)] border-[var(--border)]`}>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 flex flex-col items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1DB954]/10 text-[#1DB954]">
                        {step.icon}
                      </div>
                      <span className="text-[10px] font-bold tracking-widest text-[#1DB954]">{step.number}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold mb-1.5 ${tc.text}`}>{step.title}</p>
                      <p className={`text-xs leading-relaxed mb-2 ${tc.textSec}`}>{step.description}</p>
                      <div className={`rounded-xl border-l-2 border-[#1DB954]/40 pl-3 py-1`}>
                        <p className={`text-[11px] leading-relaxed italic ${tc.textMuted}`}>{step.detail}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PLAYBOOK TAB */}
          {activeTab === 'playbook' && (
            <div className="space-y-4">
              <div className={`rounded-2xl border p-5 bg-[var(--bg-card-alt)] border-[var(--border)]`}>
                <p className={`text-sm font-bold mb-2 ${tc.text}`}>What is the Playbook?</p>
                <p className={`text-xs leading-relaxed ${tc.textSec}`}>
                  The Playbook is Deviate&apos;s most powerful feature. It is a library of your firm&apos;s standard positions on common contract clauses — built by you, used automatically in every analysis.
                </p>
                <p className={`text-xs leading-relaxed mt-2 ${tc.textSec}`}>
                  When Deviate identifies a deviation in a clause type that matches a Playbook entry, it automatically populates two columns in the findings table: <span className={`font-semibold ${tc.text}`}>Our Position</span> (your firm&apos;s preferred stance on that clause) and <span className={`font-semibold ${tc.text}`}>Suggested Response</span> (pre-drafted negotiation language ready to copy and send to opposing counsel).
                </p>
              </div>

              <div className={`rounded-2xl border p-5 bg-[var(--bg-card-alt)] border-[var(--border)]`}>
                <p className={`text-sm font-bold mb-3 ${tc.text}`}>What goes into a Playbook entry?</p>
                <div className="space-y-3">
                  {[
                    { label: 'Clause Type', color: 'text-[#1DB954]', desc: 'The name of the clause (e.g. Indemnity, Non-Compete, Governing Law). Deviate matches deviations to entries using this field.' },
                    { label: "Preferred Position", color: tc.textSec, desc: "Your firm's standard position on this clause type — what you would typically insist on in a negotiation." },
                    { label: 'Dealbreaker', color: 'text-[#FF4444]/80', desc: 'Positions or formulations that are categorically unacceptable. This is surfaced as a flag during analysis.' },
                    { label: 'Suggested Response', color: 'text-[#1DB954]', desc: 'The negotiation language your team would typically use to push back on a deviation. This is copied directly into the findings table and can be sent to opposing counsel.' },
                  ].map(({ label, color, desc }) => (
                    <div key={label} className="flex gap-3">
                      <span className={`text-xs font-bold w-36 flex-shrink-0 ${color}`}>{label}</span>
                      <p className={`text-xs leading-relaxed ${tc.textMuted}`}>{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`rounded-2xl border p-5 bg-[var(--bg-card-alt)] border-[var(--border)]`}>
                <p className={`text-sm font-bold mb-2 ${tc.text}`}>Recommended setup</p>
                <p className={`text-xs leading-relaxed mb-3 ${tc.textSec}`}>Deviate ships with eight default entries covering the most common Indian corporate law clause types. We recommend reviewing and customising each one to reflect your firm&apos;s actual positions before running your first matter.</p>
                <div className="flex flex-wrap gap-2">
                  {['Indemnity', 'Limitation of Liability', 'Non-Compete', 'Governing Law', 'Dispute Resolution', 'Confidentiality', 'Termination', 'Data Protection'].map((c) => (
                    <span key={c} className="rounded-full border border-[#1DB954]/20 bg-[#1DB954]/5 px-3 py-1 text-[10px] font-semibold text-[#1DB954]">{c}</span>
                  ))}
                </div>
                <a
                  href="/playbook"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-green-900/20 transition-all hover:scale-[1.02]"
                >
                  Open Playbook editor
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </a>
              </div>
            </div>
          )}

          {/* FAQ TAB */}
          {activeTab === 'faq' && (
            <div className="space-y-2">
              {GUIDE_FAQS.map((faq, i) => (
                <div key={i} className={`rounded-2xl border overflow-hidden bg-[var(--bg-card-alt)] border-[var(--border)]`}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className={`w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[#1DB954]/[0.03]`}
                  >
                    <span className={`text-sm font-semibold ${tc.text}`}>{faq.q}</span>
                    <span className={`flex-shrink-0 text-lg font-light transition-transform duration-200 ${openFaq === i ? 'rotate-45 text-[#1DB954]' : tc.textMuted}`}>+</span>
                  </button>
                  {openFaq === i && (
                    <div className={`px-5 pb-4 border-t border-[var(--border)]`}>
                      <p className={`text-xs leading-relaxed pt-3 ${tc.textSec}`}>{faq.a}</p>
                    </div>
                  )}
                </div>
              ))}

              <div className={`rounded-2xl border p-5 mt-4 border-[#1DB954]/20 bg-[#1DB954]/5`}>
                <p className="text-xs font-semibold text-[#1DB954] mb-1">Disclaimer</p>
                <p className="text-xs leading-relaxed text-[#1DB954]/70">
                  Deviate is an AI-assisted legal analysis tool. All output is generated automatically and must be reviewed by a qualified legal professional before reliance. Deviate does not constitute legal advice. Findings should be treated as attorney work product and handled accordingly.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Home() {
  const { dark, toggle: toggleTheme } = useTheme()
  const [phase, setPhase] = useState(PHASES.UPLOAD)
  const [playbookEntries, setPlaybookEntries] = useState([])

  const [firmFiles, setFirmFiles] = useState([])
  const [counterpartyFiles, setCounterpartyFiles] = useState([])
  const [extracting, setExtracting] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  const [pairs, setPairs] = useState([])
  const [pairScores, setPairScores] = useState({})

  const [pairResults, setPairResults] = useState([])
  const [analyzeError, setAnalyzeError] = useState(null)

  const [detailPairId, setDetailPairId] = useState(null)
  const [detailFilter, setDetailFilter] = useState(null)
  const [detailRiskFilter, setDetailRiskFilter] = useState(null)
  const [exportingPairId, setExportingPairId] = useState(null)
  const [exportMessage, setExportMessage] = useState(null)
  const [exportPreviewResult, setExportPreviewResult] = useState(null)
  const [showGuide, setShowGuide] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

  const [savedBatches, setSavedBatches] = useState([])
  const [viewingBatchId, setViewingBatchId] = useState(null)

  const [showCelebration, setShowCelebration] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    setPlaybookEntries(getPlaybook())
    setSavedBatches(getBatches())
  }, [])

  // Rotating tips during analysis
  useEffect(() => {
    if (phase !== PHASES.ANALYZING) return
    const interval = setInterval(() => {
      setTipIndex((i) => (i + 1) % LOADING_TIPS.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [phase])

  // ── Upload ──────────────────────────────────────────────────────────────────

  const addFirmFiles = (incoming) => {
    setFirmFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      return [...prev, ...incoming.filter((f) => !existing.has(f.name)).map((f) => ({ name: f.name, file: f }))]
    })
    setUploadError(null)
  }

  const removeFirmFile = (index) => setFirmFiles((prev) => prev.filter((_, i) => i !== index))

  const addCounterpartyFiles = (incoming) => {
    setCounterpartyFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      return [...prev, ...incoming.filter((f) => !existing.has(f.name)).map((f) => ({ name: f.name, file: f }))]
    })
    setUploadError(null)
  }

  const removeCounterpartyFile = (index) => setCounterpartyFiles((prev) => prev.filter((_, i) => i !== index))

  const handleExtractAndProceed = async () => {
    if (firmFiles.length === 0 || counterpartyFiles.length === 0) {
      setUploadError('Upload at least one document on each side before continuing.')
      return
    }
    setExtracting(true)
    setUploadError(null)

    const formData = new FormData()
    firmFiles.forEach((f, i) => formData.append(`firmDoc_${i}`, f.file))
    counterpartyFiles.forEach((f, i) => formData.append(`counterpartyDoc_${i}`, f.file))

    try {
      const res = await fetch('/api/extract', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || 'Extraction failed')
      }
      const data = await res.json()
      setFirmFiles(data.firmDocs.map((d) => ({ name: d.name, text: d.text, chars: d.chars })))
      setCounterpartyFiles(data.counterpartyDocs.map((d) => ({ name: d.name, text: d.text, chars: d.chars })))
      const { pairs: suggestedPairs, scores } = buildAutoSuggestions(data.firmDocs, data.counterpartyDocs)
      setPairScores(scores)
      setPairs(data.firmDocs.map((fd) => ({
        pairId: generateId(),
        firmDocName: fd.name,
        counterpartyDocName: suggestedPairs[fd.name] || null,
        skip: false,
      })))
      setPhase(PHASES.PAIRING)
    } catch (err) {
      setUploadError(err.message || 'Failed to extract documents')
    } finally {
      setExtracting(false)
    }
  }

  // ── Pairing ─────────────────────────────────────────────────────────────────

  const updatePair = (pairId, field, value) =>
    setPairs((prev) => prev.map((p) => (p.pairId === pairId ? { ...p, [field]: value } : p)))

  const confirmedPairs = pairs.filter((p) => !p.skip && p.counterpartyDocName)

  // ── Analysis ────────────────────────────────────────────────────────────────

  const handleAnalyzeAll = useCallback(async () => {
    if (confirmedPairs.length === 0) return
    setPhase(PHASES.ANALYZING)
    setAnalyzeError(null)
    setTipIndex(0)

    const initial = confirmedPairs.map((p) => ({
      pairId: p.pairId,
      doc1Name: p.firmDocName,
      doc2Name: p.counterpartyDocName,
      deviations: [],
      summary: { total: 0, high: 0, medium: 0, low: 0 },
      status: 'analyzing',
    }))
    setPairResults(initial)

    const payloadPairs = confirmedPairs.map((p) => {
      const firmDoc = firmFiles.find((f) => f.name === p.firmDocName)
      const cpDoc = counterpartyFiles.find((f) => f.name === p.counterpartyDocName)
      return { pairId: p.pairId, doc1Name: p.firmDocName, doc2Name: p.counterpartyDocName, doc1Text: firmDoc?.text || '', doc2Text: cpDoc?.text || '' }
    })

    try {
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs: payloadPairs }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || 'Batch analysis failed')
      }
      const data = await res.json()
      const results = data.results || []

      const finalResults = initial.map((slot) => {
        const found = results.find((r) => r.pairId === slot.pairId)
        if (!found) return { ...slot, status: 'error', error: 'No result returned' }
        return { ...slot, deviations: found.deviations || [], summary: found.summary || slot.summary, status: found.error ? 'error' : 'complete', error: found.error || null }
      })

      setPairResults(finalResults)

      const batchSummary = {
        totalPairs: finalResults.length,
        totalDeviations: finalResults.reduce((acc, r) => acc + (r.summary?.total  || 0), 0),
        high:   finalResults.reduce((acc, r) => acc + (r.summary?.high   || 0), 0),
        medium: finalResults.reduce((acc, r) => acc + (r.summary?.medium || 0), 0),
        low:    finalResults.reduce((acc, r) => acc + (r.summary?.low    || 0), 0),
      }

      saveBatch({
        id: generateId(),
        date: new Date().toISOString(),
        pairs: finalResults.map((r) => {
          const firmDoc = firmFiles.find((f) => f.name === r.doc1Name)
          const cpDoc = counterpartyFiles.find((f) => f.name === r.doc2Name)
          return { pairId: r.pairId, doc1Name: r.doc1Name, doc2Name: r.doc2Name, doc1Text: firmDoc?.text || '', doc2Text: cpDoc?.text || '', doc1Chars: firmDoc?.chars || 0, doc2Chars: cpDoc?.chars || 0, deviations: r.deviations, summary: r.summary }
        }),
        summary: batchSummary,
      })
      setSavedBatches(getBatches())

      // Celebration moment
      setShowCelebration(true)
      setTimeout(() => {
        setShowCelebration(false)
        setPhase(PHASES.RESULTS)
      }, 1900)
    } catch (err) {
      setAnalyzeError(err.message || 'Analysis failed')
      setPairResults((prev) => prev.map((r) => (r.status === 'analyzing' ? { ...r, status: 'error', error: err.message } : r)))
      setPhase(PHASES.RESULTS)
    }
  }, [confirmedPairs, firmFiles, counterpartyFiles])

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExportPair = async (result) => {
    setExportPreviewResult(null)
    setExportingPairId(result.pairId)
    setExportMessage(null)
    try {
      const analysisDate = new Date().toISOString().split('T')[0]
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviations: result.deviations, doc1Name: result.doc1Name, doc2Name: result.doc2Name, analysisDate }),
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const filename = `Contract_Review_Report_${sanitizeFileName(result.doc2Name)}_${new Date().toISOString().split('T')[0]}.docx`
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setExportMessage(`Downloaded: ${filename}`)
      setTimeout(() => setExportMessage(null), 4000)
    } catch (err) {
      setExportMessage(`Export failed: ${err.message}`)
    } finally {
      setExportingPairId(null)
    }
  }

  // ── Saved reviews ────────────────────────────────────────────────────────────

  const handleViewBatch = (batchId) => {
    const batch = getBatch(batchId)
    if (!batch) return
    setViewingBatchId(batchId)
    setPairResults(batch.pairs.map((p) => ({
      pairId: p.pairId, doc1Name: p.doc1Name, doc2Name: p.doc2Name,
      deviations: p.deviations || [], summary: p.summary || { total: 0, high: 0, medium: 0, low: 0 }, status: 'complete',
    })))
    setPhase(PHASES.RESULTS)
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0)
  }

  const handleDeleteBatch = (batchId) => {
    deleteBatch(batchId)
    setSavedBatches(getBatches())
    if (viewingBatchId === batchId) handleNewAnalysis()
  }

  const handleNewAnalysis = useCallback(() => {
    setPhase(PHASES.UPLOAD)
    setFirmFiles([])
    setCounterpartyFiles([])
    setPairs([])
    setPairResults([])
    setAnalyzeError(null)
    setUploadError(null)
    setDetailPairId(null)
    setDetailFilter(null)
    setDetailRiskFilter(null)
    setViewingBatchId(null)
    setExportMessage(null)
    setExportPreviewResult(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleExportPlaceholder = useCallback(() => {
    if (detailResult) setExportPreviewResult(detailResult)
  }, [])

  useKeyboardShortcuts({
    onNewAnalysis: handleNewAnalysis,
    onExport: handleExportPlaceholder,
    onAnalyze: handleAnalyzeAll,
    canAnalyze: phase === PHASES.PAIRING && confirmedPairs.length > 0,
  })

  const detailResult = pairResults.find((r) => r.pairId === detailPairId)
  const analysisDone = pairResults.filter((r) => r.status === 'complete' || r.status === 'error').length
  const showSidebar = phase !== PHASES.REVIEWS

  // ── Sidebar ──────────────────────────────────────────────────────────────────

  const renderSidebar = () => {
    if (phase === PHASES.UPLOAD) return <UploadSidebar firmCount={firmFiles.length} cpCount={counterpartyFiles.length} />
    if (phase === PHASES.PAIRING) return <PairingSidebar confirmedCount={confirmedPairs.length} />
    if (phase === PHASES.ANALYZING) return null
    if (phase === PHASES.RESULTS && detailPairId && detailResult) {
      return <DetailSidebar deviations={detailResult.deviations} activeFilter={detailFilter} onFilterChange={setDetailFilter} />
    }
    if (phase === PHASES.RESULTS) {
      return <ResultsSidebar pairResults={pairResults} onNewAnalysis={handleNewAnalysis} />
    }
    return null
  }

  const sidebar = renderSidebar()

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen ${tc.bg} ${tc.text} transition-colors duration-300`}>

      <CelebrationOverlay visible={showCelebration} />

      {exportPreviewResult && (
        <ExportPreviewModal
          result={exportPreviewResult}
          onConfirm={() => handleExportPair(exportPreviewResult)}
          onClose={() => setExportPreviewResult(null)}
          exporting={exportingPairId === exportPreviewResult.pairId}
        />
      )}

      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {/* ── Header ── */}
      <header className={`sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-xl`}>
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-6">
          <button
            type="button"
            onClick={handleNewAnalysis}
            className="flex cursor-pointer flex-col items-start gap-0 transition-opacity hover:opacity-80"
          >
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xl tracking-tight text-[#1DB954]">◆</span>
              <span className={`font-extrabold text-xl tracking-tight ${tc.text}`}>deviate</span>
              <span className="rounded-full border border-[#1DB954]/30 bg-[#1DB954]/10 px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#1DB954] tracking-wide">v1</span>
            </div>
            <p className="flicker-tagline text-[10px] font-medium tracking-[0.18em] uppercase text-[var(--text-muted)] pl-6">AI‑Powered Negotiation Risk Analysis</p>
          </button>

          <nav className="flex items-center gap-1">
            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              <button
                type="button"
                onClick={handleNewAnalysis}
                className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  phase !== PHASES.REVIEWS ? 'text-[#1DB954]' : `${tc.textSec} hover:bg-white/5`
                }`}
              >
                New Analysis
              </button>
              <button
                type="button"
                onClick={() => setPhase(PHASES.REVIEWS)}
                className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  phase === PHASES.REVIEWS ? 'text-[#1DB954]' : `${tc.textSec} hover:bg-white/5`
                }`}
              >
                My Reviews
              </button>
              <a
                href="/playbook"
                className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all duration-200 ${tc.textSec} hover:bg-white/5`}
              >
                Playbook
              </a>
              <button
                type="button"
                onClick={() => setShowGuide(true)}
                className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all duration-200 ${tc.textSec} hover:bg-white/5`}
              >
                How it works
              </button>
              <button
                type="button"
                onClick={() => setShowAbout(true)}
                className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all duration-200 ${tc.textSec} hover:bg-white/5`}
              >
                About
              </button>
            </div>

            <div className="ml-2 flex items-center gap-2">
              <ShortcutsPanel />
              <ThemeToggle dark={dark} onToggle={toggleTheme} />
              {/* Mobile hamburger */}
              <MobileMenu
                dark={dark}
                phase={phase}
                onNewAnalysis={handleNewAnalysis}
                onReviews={() => setPhase(PHASES.REVIEWS)}
                onGuide={() => setShowGuide(true)}
                onAbout={() => setShowAbout(true)}
              />
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-5 sm:py-8">
        {showSidebar ? (
          <div className={`flex items-start gap-8 ${phase === PHASES.ANALYZING ? 'justify-center' : ''}`}>

            {/* ── Main content column ── */}
            <div className="min-w-0 flex-1 space-y-6">

              {/* UPLOAD */}
              {phase === PHASES.UPLOAD && (
                <section className={`animate-fade-in-up space-y-6 rounded-3xl border p-5 sm:p-8 ${tc.card}`}>
                  <div>
                    <h2 className={`text-xl font-bold ${tc.text}`}>New matter review</h2>
                    <p className={`mt-1 text-sm ${tc.textMuted}`}>Upload all documents first. You will pair them in the next step.</p>
                  </div>

                  {firmFiles.length === 0 && counterpartyFiles.length === 0 && (
                    <div className={`flex items-center gap-4 rounded-2xl border border-dashed px-5 py-4 border-[var(--border)]`}>
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[#1DB954]/10">
                        <span className="text-sm font-extrabold text-[#1DB954]">◆</span>
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${tc.text}`}>Ready to spot what they changed?</p>
                        <p className={`text-xs ${tc.textMuted}`}>Upload both sides below and get a full deviation report in seconds.</p>
                      </div>
                    </div>
                  )}

                  <UploadZone
                    label="Your firm's documents"
                    subtitle="Original agreements, term sheets, or templates your firm prepared"
                    files={firmFiles}
                    onAdd={addFirmFiles}
                    onRemove={removeFirmFile}
                  />

                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${tc.cardAlt} ${tc.textMuted} text-xs`}>↓</div>
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[var(--border)] to-transparent" />
                  </div>

                  <UploadZone
                    label="Counterparty documents"
                    subtitle="Marked-up or revised versions received from the other side"
                    files={counterpartyFiles}
                    onAdd={addCounterpartyFiles}
                    onRemove={removeCounterpartyFile}
                  />

                  {uploadError && (
                    <div className="rounded-2xl border border-[#FF4444]/20 bg-[#FF4444]/5 p-4 text-sm text-[#FF4444]">{uploadError}</div>
                  )}

                  {extracting && (
                    <div className="rounded-2xl border border-[#1DB954]/20 bg-[#1DB954]/5 p-4 text-sm text-[#1DB954]">
                      <p className="font-semibold">Reading documents...</p>
                      <p className="mt-1 text-[#1DB954]/70">This takes a few seconds depending on file size.</p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleExtractAndProceed}
                    disabled={extracting || firmFiles.length === 0 || counterpartyFiles.length === 0}
                    className="w-full rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] py-3.5 text-sm font-semibold text-white shadow-lg shadow-green-900/20 transition-all duration-200 hover:shadow-green-900/40 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  >
                    {extracting ? 'Extracting text...' : 'Continue to pairing →'}
                  </button>
                </section>
              )}

              {/* PAIRING */}
              {phase === PHASES.PAIRING && (
                <section className={`animate-fade-in-up space-y-5 rounded-3xl border p-5 sm:p-8 ${tc.card}`}>
                  <div>
                    <h2 className={`text-xl font-bold ${tc.text}`}>Pair documents</h2>
                    <p className={`mt-1 text-sm ${tc.textMuted}`}>Match each firm document with its counterparty version.</p>
                  </div>

                  <div className="space-y-3">
                    {pairs.map((pair) => {
                      const firmDoc = firmFiles.find((f) => f.name === pair.firmDocName)
                      const rawScore = pairScores[pair.firmDocName] || 0
                      const confPct = Math.round(rawScore * 100)
                      const hasMatch = pair.counterpartyDocName && rawScore > 0.3
                      const confLabel = hasMatch
                        ? confPct >= 80 ? `${confPct}% confidence` : confPct >= 50 ? `${confPct}% confidence` : `${confPct}% confidence`
                        : 'No clear match found'
                      const confColor = hasMatch
                        ? confPct >= 80 ? 'text-[#1DB954]' : confPct >= 50 ? 'text-[#FF6719]' : 'text-[#FF4444]'
                        : tc.textMuted

                      return (
                        <div
                          key={pair.pairId}
                          className={`rounded-2xl border p-5 transition-all duration-200 ${
                            pair.skip ? `border-[var(--border)] opacity-40` : `border-[var(--border)] bg-[var(--bg-card-alt)]`
                          }`}
                        >
                          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto]">
                            <div>
                              <p className={`text-[10px] font-semibold uppercase tracking-widest ${tc.textMuted}`}>Your document</p>
                              <p className={`mt-0.5 truncate text-sm font-semibold ${tc.text}`}>{pair.firmDocName}</p>
                              {firmDoc?.chars != null && <p className={`text-xs ${tc.textMuted}`}>{firmDoc.chars.toLocaleString()} chars</p>}
                            </div>
                            <div className={`flex items-center justify-center ${tc.textMuted} text-lg`}>⇄</div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <p className={`text-[10px] font-semibold uppercase tracking-widest ${tc.textMuted}`}>Counterparty document</p>
                                {!pair.skip && (
                                  <span className={`text-[10px] font-semibold ${confColor}`}>{confLabel}</span>
                                )}
                              </div>
                              <select
                                disabled={pair.skip}
                                value={pair.counterpartyDocName || ''}
                                onChange={(e) => updatePair(pair.pairId, 'counterpartyDocName', e.target.value || null)}
                                style={{ colorScheme: dark ? 'dark' : 'light' }}
                                className={`w-full rounded-xl border px-3 py-2 text-sm transition-colors focus:border-[#1DB954] focus:outline-none focus:ring-1 focus:ring-[#1DB954]/50 disabled:opacity-40 ${tc.card} ${tc.text}`}
                              >
                                <option value="">Select counterparty document</option>
                                {counterpartyFiles.map((f) => (
                                  <option key={f.name} value={f.name}>{f.name} {f.chars ? `(${f.chars.toLocaleString()} chars)` : ''}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              {!pair.skip && pair.counterpartyDocName && <span className="text-xs font-semibold text-[#1DB954]">Paired</span>}
                              {!pair.skip && !pair.counterpartyDocName && <span className="text-xs font-semibold text-[#FF6719]">Unpaired</span>}
                              <button
                                type="button"
                                onClick={() => updatePair(pair.pairId, 'skip', !pair.skip)}
                                className={`text-xs underline transition-colors hover:${tc.text} ${tc.textMuted}`}
                              >
                                {pair.skip ? 'Include' : 'Skip'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {confirmedPairs.length === 0 && (
                    <div className="rounded-2xl border border-[#FF6719]/20 bg-[#FF6719]/5 p-4 text-sm text-[#FF6719]">
                      Select at least one counterparty document to continue.
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setPhase(PHASES.UPLOAD)}
                      className={`text-sm font-medium transition-colors hover:${tc.text} ${tc.textSec}`}
                    >
                      ← Back to upload
                    </button>
                    <button
                      type="button"
                      onClick={handleAnalyzeAll}
                      disabled={confirmedPairs.length === 0}
                      className="rounded-2xl bg-gradient-to-r from-[#FF6719] to-[#FF4500] px-5 sm:px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-900/20 transition-all duration-200 hover:shadow-orange-900/40 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                    >
                      <span className="hidden sm:inline">Ready to spot what they changed? </span>Analyze {confirmedPairs.length} pair{confirmedPairs.length !== 1 ? 's' : ''} →
                    </button>
                  </div>
                </section>
              )}

              {/* ANALYZING */}
              {phase === PHASES.ANALYZING && (
                <AnalyzingScreen
                  total={pairResults.length}
                  done={analysisDone}
                  currentTip={LOADING_TIPS[tipIndex]}
                />
              )}

              {/* RESULTS DASHBOARD */}
              {phase === PHASES.RESULTS && !detailPairId && (
                <section className="animate-fade-in-up space-y-5">
                  {viewingBatchId && (
                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#1DB954]/20 bg-[#1DB954]/5 p-4 text-sm text-[#1DB954]">
                      <span>Viewing saved review from {new Date(getBatch(viewingBatchId)?.date).toLocaleString()}</span>
                      <button
                        type="button"
                        onClick={handleNewAnalysis}
                        className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-1.5 text-sm font-semibold text-[#1DB954] transition-all hover:bg-[#1DB954]/20"
                      >
                        New analysis
                      </button>
                    </div>
                  )}

                  <div className={`rounded-3xl border p-6 ${tc.card}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className={`text-xl font-bold ${tc.text}`}>Results</h2>
                        <p className={`mt-1 text-sm ${tc.textMuted}`}>
                          {pairResults.filter((r) => r.status === 'complete').length} of {pairResults.length} pairs analyzed
                        </p>
                      </div>
                      {analyzeError && (
                        <div className="rounded-2xl border border-[#FF4444]/20 bg-[#FF4444]/5 p-3 text-xs text-[#FF4444]">{analyzeError}</div>
                      )}
                    </div>
                    {exportMessage && (
                      <div className="mt-4 rounded-2xl border border-[#1DB954]/20 bg-[#1DB954]/5 p-3 text-xs text-[#1DB954]">{exportMessage}</div>
                    )}
                    <div className="mt-5 space-y-4">
                      {pairResults.map((result) => (
                        <PairingSummaryCard
                          key={result.pairId}
                          pair={result}
                          onViewDetail={() => { setDetailPairId(result.pairId); setDetailFilter(null); setDetailRiskFilter(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                          onExportPreview={() => setExportPreviewResult(result)}
                          exporting={exportingPairId === result.pairId}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* DETAIL VIEW */}
              {phase === PHASES.RESULTS && detailPairId && detailResult && (
                <section className="animate-fade-in-up space-y-5">
                  <button
                    type="button"
                    onClick={() => { setDetailPairId(null); setDetailFilter(null); setDetailRiskFilter(null) }}
                    className={`text-sm font-medium transition-colors hover:${tc.text} ${tc.textSec}`}
                  >
                    ← Back to results
                  </button>

                  <div className={`space-y-5 rounded-3xl border p-4 sm:p-6 ${tc.card}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className={`text-xl font-bold ${tc.text}`}>{detailResult.doc2Name}</h2>
                        <p className={`mt-1 text-sm ${tc.textMuted}`}>compared with {detailResult.doc1Name}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailRiskFilter(null)}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 hover:scale-[1.04] ${detailRiskFilter === null ? `bg-[var(--bg-card-alt)] border-[var(--text-muted)] ${tc.text}` : `${tc.textSec} border-[var(--border)]`}`}
                          >
                            {detailResult.summary.total} deviations
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailRiskFilter(detailRiskFilter === 'High' ? null : 'High')}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 hover:scale-[1.04] ${detailRiskFilter === 'High' ? 'border-[#FF4444] bg-[#FF4444]/20 text-[#FF4444] shadow-[0_0_10px_rgba(255,68,68,0.2)]' : 'border-[#FF4444]/20 bg-[#FF4444]/10 text-[#FF4444]'}`}
                          >
                            {detailResult.summary.high} high
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailRiskFilter(detailRiskFilter === 'Medium' ? null : 'Medium')}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 hover:scale-[1.04] ${detailRiskFilter === 'Medium' ? 'border-[#FF6719] bg-[#FF6719]/20 text-[#FF6719] shadow-[0_0_10px_rgba(255,103,25,0.2)]' : 'border-[#FF6719]/20 bg-[#FF6719]/10 text-[#FF6719]'}`}
                          >
                            {detailResult.summary.medium} medium
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailRiskFilter(detailRiskFilter === 'Low' ? null : 'Low')}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 hover:scale-[1.04] ${detailRiskFilter === 'Low' ? 'border-[#1DB954] bg-[#1DB954]/20 text-[#1DB954] shadow-[0_0_10px_rgba(29,185,84,0.2)]' : 'border-[#1DB954]/20 bg-[#1DB954]/10 text-[#1DB954]'}`}
                          >
                            {detailResult.summary.low} low
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <button
                          type="button"
                          onClick={() => setExportPreviewResult(detailResult)}
                          disabled={exportingPairId === detailResult.pairId}
                          className="rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-900/20 transition-all duration-200 hover:shadow-green-900/40 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
                        >
                          {exportingPairId === detailResult.pairId ? 'Generating...' : 'Export report'}
                        </button>
                        {exportMessage && <p className="text-xs text-[#1DB954]">{exportMessage}</p>}
                      </div>
                    </div>

                    {detailResult.deviations.length === 0 ? (
                      <div className="rounded-3xl border border-[#1DB954]/20 bg-[#1DB954]/5 p-12 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#1DB954]/20">
                          <svg className="h-7 w-7 text-[#1DB954]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                          </svg>
                        </div>
                        <p className="text-base font-bold text-[#1DB954]">Clean draft</p>
                        <p className="mt-1 text-sm text-[#1DB954]/70">No material deviations found between these documents.</p>
                      </div>
                    ) : (
                      <DeviationTable
                        deviations={detailResult.deviations}
                        playbookEntries={playbookEntries}
                        activeFilter={detailFilter}
                        activeRiskFilter={detailRiskFilter}
                        onFilterChange={setDetailFilter}
                      />
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* ── Sticky sidebar ── */}
            {sidebar && (
              <aside className="hidden w-80 flex-shrink-0 lg:block sticky top-20">
                {sidebar}
              </aside>
            )}
          </div>

        ) : (
          /* My Reviews full width */
          <section className={`animate-fade-in-up space-y-5 rounded-3xl border p-5 sm:p-8 ${tc.card}`}>
            <div>
              <h2 className={`text-xl font-bold ${tc.text}`}>My Reviews</h2>
              <p className={`mt-1 text-sm ${tc.textMuted}`}>Saved matter reviews. Each entry may contain multiple document pairs.</p>
            </div>

            {savedBatches.length === 0 ? (
              <div className={`rounded-3xl border-2 border-dashed p-16 text-center border-[var(--border)] bg-[var(--bg-input)]`}>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1DB954]/10 glow-green">
                  <span className="text-2xl font-extrabold text-[#1DB954]">◆</span>
                </div>
                <p className={`text-sm font-semibold ${tc.textSec}`}>Your review history lives here</p>
                <p className={`mt-1 text-xs ${tc.textMuted}`}>Run your first analysis to save a matter review.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {savedBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className={`rounded-3xl border p-6 transition-all duration-300 hover:border-[#1DB954]/20 hover:shadow-xl hover:shadow-green-900/10 hover:-translate-y-1 ${tc.cardAlt} border-[var(--border)]`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className={`text-sm font-semibold ${tc.text}`}>
                          {batch.pairs?.length || 1} pair{(batch.pairs?.length || 1) !== 1 ? 's' : ''} analyzed
                        </p>
                        <p className={`mt-1 text-xs ${tc.textMuted}`}>{batch.pairs?.map((p) => p.doc2Name).join(', ')}</p>
                        <p className={`mt-1 text-xs ${tc.textMuted} opacity-60`}>{new Date(batch.date).toLocaleString()}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tc.textSec} border-[var(--border)]`}>{batch.summary?.totalDeviations || 0} deviations</span>
                        <span className="rounded-full border border-[#FF4444]/20 bg-[#FF4444]/10 px-2.5 py-1 text-xs font-semibold text-[#FF4444]">{batch.summary?.high || 0} high</span>
                        <span className="rounded-full border border-[#FF6719]/20 bg-[#FF6719]/10 px-2.5 py-1 text-xs font-semibold text-[#FF6719]">{batch.summary?.medium || 0} med</span>
                        <span className="rounded-full border border-[#1DB954]/20 bg-[#1DB954]/10 px-2.5 py-1 text-xs font-semibold text-[#1DB954]">{batch.summary?.low || 0} low</span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => handleViewBatch(batch.id)}
                        className="rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-green-900/20 transition-all duration-200 hover:shadow-green-900/40 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        View review
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBatch(batch.id)}
                        className="rounded-2xl border border-[#FF4444]/20 bg-[#FF4444]/5 px-4 py-2 text-xs font-semibold text-[#FF4444] transition-all duration-200 hover:bg-[#FF4444]/10"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      {/* ── Footer ── */}
      <footer className={`mt-16 border-t border-[var(--border)]`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">

            {/* Left: branding + contact inline */}
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[#1DB954] font-extrabold text-lg">◆</span>
                <span className={`font-extrabold text-lg tracking-tight ${tc.text}`}>deviate</span>
                <span className="rounded-full border border-[#1DB954]/30 bg-[#1DB954]/10 px-1.5 py-0.5 text-[9px] font-bold leading-none text-[#1DB954]">v1</span>
              </div>
              <p className={`text-xs mt-1 ${tc.textMuted}`}>AI-Powered Negotiation Risk Analysis</p>
              <div className="flex items-center gap-2 mt-1">
                <p className={`text-xs ${tc.textMuted}`}>Built by Rishab Ramakrishna · JGLS &apos;26</p>
                <a
                  href="mailto:rishabrsid@gmail.com"
                  className={`flex h-6 w-6 items-center justify-center rounded-lg border transition-all hover:border-[#1DB954]/30 hover:text-[#1DB954] ${tc.card} ${tc.textMuted}`}
                  aria-label="Email"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </a>
                <a
                  href="https://www.linkedin.com/in/rishab-ramakrishna-ab3b46228/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex h-6 w-6 items-center justify-center rounded-lg border transition-all hover:border-[#0A66C2]/30 hover:text-[#0A66C2] ${tc.card} ${tc.textMuted}`}
                  aria-label="LinkedIn"
                >
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className={`mt-6 pt-5 border-t border-[var(--border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2`}>
            <p className={`text-[11px] ${tc.textMuted}`}>© {new Date().getFullYear()} Rishab Ramakrishna. All rights reserved.</p>
            <p className={`text-[11px] ${tc.textMuted}`}>Deviate is an AI tool. All output must be reviewed by qualified legal counsel before reliance.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}