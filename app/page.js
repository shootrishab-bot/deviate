'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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

// ─── Scroll reveal ────────────────────────────────────────────────────────────

function Reveal({ children, delay = 0, y = 20, x = 0, scale = 1, duration = 620, className = '' }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const still = typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (still || typeof IntersectionObserver === 'undefined') { setShown(true); return }
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight && rect.bottom > 0) { setShown(true); return }
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); io.disconnect() } },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
        transition: `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        willChange: shown ? 'auto' : 'opacity, transform',
      }}
    >
      {children}
    </div>
  )
}

// ─── Screenshot scaler ────────────────────────────────────────────────────────
// Mock screens are authored at true application dimensions, then scaled to fit
// their container so they read as genuine product screenshots.

const SHOT_W = 1180
const SHOT_H = 720
const MIN_SCALE = 0.52

function ScreenScaler({ children }) {
  const ref = useRef(null)
  const [scale, setScale] = useState(MIN_SCALE)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setScale(Math.max(el.clientWidth / SHOT_W, MIN_SCALE))
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="w-full overflow-x-auto overflow-y-hidden touch-pan-x">
      <div style={{ width: SHOT_W * scale, height: SHOT_H * scale }}>
        <div style={{ width: SHOT_W, height: SHOT_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Browser + app chrome around every mock screen ────────────────────────────

const MOCK_NAV = ['New Analysis', 'My Reviews', 'Playbook', 'How it works', 'About']

function MockChrome({ url = 'deviate.app/app', activeNav = 'New Analysis', children }) {
  return (
    <div className={`flex h-full w-full flex-col overflow-hidden ${tc.bg}`}>
      {/* Window bar */}
      <div className={`flex h-11 flex-shrink-0 items-center gap-3 border-b px-5 ${tc.cardAlt}`}>
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#FF4444]/70" />
          <span className="h-3 w-3 rounded-full bg-[#FF6719]/70" />
          <span className="h-3 w-3 rounded-full bg-[#1DB954]/70" />
        </div>
        <div className={`ml-3 flex h-6 flex-1 items-center gap-2 rounded-full border px-3 ${tc.input}`}>
          <svg className="h-3 w-3 text-[#1DB954]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 118 0v3" />
          </svg>
          <span className={`text-[11px] ${tc.textMuted}`}>{url}</span>
        </div>
      </div>

      {/* App header */}
      <div className={`flex h-[60px] flex-shrink-0 items-center justify-between border-b px-7 ${tc.card}`}>
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-extrabold tracking-tight text-[#1DB954]">◆</span>
            <span className={`text-lg font-extrabold tracking-tight ${tc.text}`}>deviate</span>
            <span className="rounded-full border border-[#1DB954]/30 bg-[#1DB954]/10 px-1.5 py-0.5 text-[9px] font-bold leading-none tracking-wide text-[#1DB954]">v1</span>
          </div>
          <p className={`pl-5 text-[8px] font-medium uppercase tracking-[0.18em] ${tc.textMuted}`}>AI-Powered Negotiation Risk Analysis</p>
        </div>
        <div className="flex items-center gap-1">
          {MOCK_NAV.map((item) => (
            <span
              key={item}
              className={`rounded-2xl px-3 py-1.5 text-[12px] font-medium ${item === activeNav ? 'text-[#1DB954]' : tc.textSec}`}
            >
              {item}
            </span>
          ))}
          <span className={`ml-2 flex h-7 w-7 items-center justify-center rounded-xl border ${tc.card}`}>
            <svg className={`h-3.5 w-3.5 ${tc.textMuted}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-hidden">
        <div className="h-full px-7 py-6">{children}</div>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-14"
          style={{ background: 'linear-gradient(to top, var(--bg), transparent)' }}
        />
      </div>
    </div>
  )
}

// ─── Mock atoms ───────────────────────────────────────────────────────────────

function MockRisk({ level }) {
  const cls =
    level === 'High'
      ? 'bg-[#FF4444]/10 text-[#FF4444] border-[#FF4444]/20'
      : level === 'Medium'
      ? 'bg-[#FF6719]/10 text-[#FF6719] border-[#FF6719]/20'
      : 'bg-[#1DB954]/10 text-[#1DB954] border-[#1DB954]/20'
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>{level}</span>
}

function MockType({ type }) {
  const cls =
    type === 'Added'
      ? 'bg-[#1DB954]/10 text-[#1DB954] border-[#1DB954]/20'
      : type === 'Omitted'
      ? 'bg-[#FF4444]/10 text-[#FF4444] border-[#FF4444]/20'
      : 'bg-[#FF6719]/10 text-[#FF6719] border-[#FF6719]/20'
  return <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{type}</span>
}

function MockCard({ title, children, className = '' }) {
  return (
    <div className={`rounded-3xl border p-5 ${tc.card} ${className}`}>
      {title && <p className={`mb-3 text-[13px] font-semibold tracking-tight ${tc.text}`}>{title}</p>}
      <div className={`space-y-2 text-[12px] leading-relaxed ${tc.textSec}`}>{children}</div>
    </div>
  )
}

function MockFileChip({ name, chars }) {
  return (
    <div className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] ${tc.card} ${tc.text}`}>
      <span className="max-w-[210px] truncate font-medium">{name}</span>
      <span className={`text-[11px] ${tc.textMuted}`}>{chars}</span>
      <span className={`ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[12px] ${tc.textMuted}`}>&times;</span>
    </div>
  )
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_DEVIATIONS = [
  {
    clause: 'Limitation of Liability',
    type: 'Modified',
    risk: 'High',
    ours: 'Aggregate liability capped at 100% of fees paid in the preceding 12 months.',
    theirs: 'Cap deleted. Clause is now silent on aggregate liability.',
    why: 'Removing the cap exposes the client to unlimited damages on a mandate worth INR 4.2 crore.',
    position: 'Liability cap at 100% of contract value. Exclusion of consequential and indirect damages.',
    response: 'Our standard position excludes consequential and indirect loss and caps aggregate liability at contract value. We can discuss a higher cap for data breaches.',
  },
  {
    clause: 'Indemnity',
    type: 'Modified',
    risk: 'High',
    ours: 'Mutual indemnity capped at contract value, carve-outs for gross negligence.',
    theirs: 'Indemnity now runs one way in the counterparty favour and is uncapped.',
    why: 'A unilateral uncapped indemnity is flagged as a dealbreaker in your playbook.',
    position: 'Mutual indemnity capped at contract value, with carve-outs for gross negligence and wilful misconduct.',
    response: 'We propose mutual indemnity with a cap equal to fees paid in the preceding 12 months. Happy to discuss carve-outs for IP infringement.',
  },
  {
    clause: 'Dispute Resolution',
    type: 'Modified',
    risk: 'Medium',
    ours: 'SIAC arbitration, seat in Singapore, sole arbitrator below INR 5 crore.',
    theirs: 'Three-member panel, seat moved to London under LCIA rules.',
    why: 'A three-member panel roughly triples cost and adds months for a dispute of this size.',
    position: 'SIAC or DIAC arbitration, seat in Singapore or Dubai, sole arbitrator under INR 5 crore.',
    response: 'We prefer institutional arbitration (SIAC/DIAC) with a Singapore seat. A three-member panel is disproportionate for disputes of this size; we propose a sole arbitrator.',
  },
  {
    clause: 'Non-Solicitation',
    type: 'Added',
    risk: 'Medium',
    ours: 'Not present in the term sheet.',
    theirs: 'New 24-month non-solicit covering all employees and contractors.',
    why: 'Inserted restraint reaches well beyond the hiring scope the parties agreed.',
    position: null,
    response: null,
  },
  {
    clause: 'Force Majeure',
    type: 'Omitted',
    risk: 'Low',
    ours: 'Standard force majeure relief with a 30-day termination right.',
    theirs: 'Clause removed in its entirety.',
    why: 'Statutory relief under s.56 of the Contract Act still applies; limited practical impact.',
    position: null,
    response: null,
  },
]

const DEMO_PAIRS = [
  { doc2: 'MSA_Vendor_Counterparty_v3.docx', doc1: 'MSA_Vendor_Firm_Draft.docx', total: 14, high: 3, medium: 6, low: 5 },
  { doc2: 'SHA_SeriesA_Investor_Markup.pdf', doc1: 'SHA_SeriesA_Term_Sheet.pdf', total: 9, high: 2, medium: 3, low: 4 },
  { doc2: 'NDA_Mutual_Returned.docx', doc1: 'NDA_Mutual_Standard.docx', total: 4, high: 0, medium: 1, low: 3 },
]

// ─── Mock screen 01 · Upload ──────────────────────────────────────────────────

function MockDropzone({ label, subtitle, files }) {
  return (
    <div>
      <div className={`rounded-3xl border-2 border-dashed p-6 text-center ${tc.input}`}>
        <div className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${tc.cardAlt}`}>
          <svg className={`h-5 w-5 ${tc.textMuted}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <p className={`text-[13px] font-semibold ${tc.text}`}>{label}</p>
        <p className={`mt-0.5 text-[11px] ${tc.textMuted}`}>{subtitle}</p>
        <p className={`mt-1.5 text-[11px] ${tc.textMuted}`}>Drag and drop or click to browse · PDF or DOCX</p>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {files.map((f) => <MockFileChip key={f.name} name={f.name} chars={f.chars} />)}
      </div>
    </div>
  )
}

function ScreenUpload() {
  return (
    <MockChrome activeNav="New Analysis">
      <div className="flex h-full items-start gap-7">
        <div className="min-w-0 flex-1">
          <div className={`space-y-4 rounded-3xl border p-6 ${tc.card}`}>
            <div>
              <p className={`text-[17px] font-bold ${tc.text}`}>New matter review</p>
              <p className={`mt-0.5 text-[12px] ${tc.textMuted}`}>Upload all documents first. You will pair them in the next step.</p>
            </div>

            <MockDropzone
              label="Your firm's documents"
              subtitle="Original agreements, term sheets, or templates your firm prepared"
              files={[
                { name: 'MSA_Vendor_Firm_Draft.docx', chars: '48,210 chars' },
                { name: 'SHA_SeriesA_Term_Sheet.pdf', chars: '31,905 chars' },
                { name: 'NDA_Mutual_Standard.docx', chars: '9,140 chars' },
              ]}
            />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, transparent, var(--border), transparent)' }} />
              <div className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] ${tc.cardAlt} ${tc.textMuted}`}>↓</div>
              <div className="h-px flex-1" style={{ background: 'linear-gradient(to left, transparent, var(--border), transparent)' }} />
            </div>

            <MockDropzone
              label="Counterparty documents"
              subtitle="Marked-up or revised versions received from the other side"
              files={[
                { name: 'MSA_Vendor_Counterparty_v3.docx', chars: '51,772 chars' },
                { name: 'SHA_SeriesA_Investor_Markup.pdf', chars: '33,418 chars' },
                { name: 'NDA_Mutual_Returned.docx', chars: '9,602 chars' },
              ]}
            />

            <div className="w-full rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] py-3 text-center text-[13px] font-semibold text-white shadow-lg shadow-green-900/20">
              Continue to pairing →
            </div>
          </div>
        </div>

        <div className="w-[300px] flex-shrink-0 space-y-3">
          <MockCard title="Files loaded">
            <p className="font-semibold text-[#1DB954]">3 firm docs, 3 counterparty docs</p>
            <p>Upload on both sides to pair them up.</p>
          </MockCard>
          <MockCard title="What happens next">
            <p>You&apos;ll pair each firm document with its counterparty version. We suggest matches by filename.</p>
          </MockCard>
          <div className="flex items-center gap-3 rounded-3xl border border-[#1DB954]/20 bg-[#1DB954]/5 p-4">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#1DB954] text-[11px] font-bold text-black">✓</div>
            <p className="text-[12px] font-semibold text-[#1DB954]">Both sides loaded. Ready to pair.</p>
          </div>
        </div>
      </div>
    </MockChrome>
  )
}

// ─── Mock screen 02 · Pairing ─────────────────────────────────────────────────

function ScreenPairing() {
  const rows = [
    { firm: 'MSA_Vendor_Firm_Draft.docx', chars: '48,210 chars', cp: 'MSA_Vendor_Counterparty_v3.docx', conf: 92, tone: 'text-[#1DB954]' },
    { firm: 'SHA_SeriesA_Term_Sheet.pdf', chars: '31,905 chars', cp: 'SHA_SeriesA_Investor_Markup.pdf', conf: 74, tone: 'text-[#FF6719]' },
    { firm: 'NDA_Mutual_Standard.docx', chars: '9,140 chars', cp: 'NDA_Mutual_Returned.docx', conf: 88, tone: 'text-[#1DB954]' },
  ]
  return (
    <MockChrome activeNav="New Analysis">
      <div className="flex h-full items-start gap-7">
        <div className="min-w-0 flex-1">
          <div className={`space-y-4 rounded-3xl border p-6 ${tc.card}`}>
            <div>
              <p className={`text-[17px] font-bold ${tc.text}`}>Pair documents</p>
              <p className={`mt-0.5 text-[12px] ${tc.textMuted}`}>Match each firm document with its counterparty version.</p>
            </div>

            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.firm} className={`rounded-2xl border p-4 ${tc.cardAlt}`}>
                  <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-4">
                    <div className="min-w-0">
                      <p className={`text-[9px] font-semibold uppercase tracking-widest ${tc.textMuted}`}>Your document</p>
                      <p className={`mt-0.5 truncate text-[12px] font-semibold ${tc.text}`}>{r.firm}</p>
                      <p className={`text-[11px] ${tc.textMuted}`}>{r.chars}</p>
                    </div>
                    <div className={`flex items-center justify-center text-base ${tc.textMuted}`}>⇄</div>
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center justify-between">
                        <p className={`text-[9px] font-semibold uppercase tracking-widest ${tc.textMuted}`}>Counterparty document</p>
                        <span className={`text-[9px] font-semibold ${r.tone}`}>{r.conf}% confidence</span>
                      </div>
                      <div className={`flex items-center justify-between rounded-xl border px-3 py-2 ${tc.card}`}>
                        <span className={`truncate text-[12px] ${tc.text}`}>{r.cp}</span>
                        <span className={`ml-2 text-[10px] ${tc.textMuted}`}>▾</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-[#1DB954]">Paired</span>
                      <span className={`text-[11px] underline ${tc.textMuted}`}>Skip</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className={`text-[12px] font-medium ${tc.textSec}`}>← Back to upload</span>
              <div className="rounded-2xl bg-gradient-to-r from-[#FF6719] to-[#FF4500] px-6 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-orange-900/20">
                Ready to spot what they changed? Analyze 3 pairs →
              </div>
            </div>
          </div>
        </div>

        <div className="w-[300px] flex-shrink-0 space-y-3">
          <MockCard title="Smart pairing">
            <ul className="space-y-1.5">
              {['We matched your docs by filename similarity', 'Use the dropdown to swap any suggestion', "Skip docs you don't need analyzed", 'Go back to upload to add more files'].map((t) => (
                <li key={t} className="flex gap-2"><span className="mt-0.5 text-[#1DB954]">·</span><span>{t}</span></li>
              ))}
            </ul>
          </MockCard>
          <MockCard>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-extrabold tracking-tight text-[#1DB954]">3</span>
              <p className={`mb-1 ${tc.textSec}`}>pairs ready</p>
            </div>
          </MockCard>
        </div>
      </div>
    </MockChrome>
  )
}

// ─── Mock screen 03 · Analysing ───────────────────────────────────────────────

function ScreenAnalyzing() {
  return (
    <MockChrome activeNav="New Analysis">
      <div className="mx-auto h-full w-[720px]">
        <div className={`space-y-5 rounded-3xl border p-8 ${tc.card}`}>
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative flex items-center justify-center">
              <div className="glow-green absolute h-20 w-20 rounded-full bg-[#1DB954]/20" />
              <div className="absolute h-14 w-14 rounded-full bg-[#1DB954]/30" />
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#1DB954]">
                <svg className="animate-spin-slow h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                </svg>
              </div>
            </div>
            <div>
              <p className={`text-[22px] font-extrabold tracking-tight ${tc.text}`}>Analyzing documents</p>
              <p className={`mt-1 text-[12px] ${tc.textSec}`}>Running AI analysis on 3 pairs. Hang tight.</p>
            </div>
            <div className="w-full max-w-[360px]">
              <div className="mb-2 flex items-end justify-between">
                <span className={`text-[12px] ${tc.textSec}`}>2 of 3 complete</span>
                <span className="text-xl font-extrabold text-[#1DB954]">67%</span>
              </div>
              <div className={`h-2.5 w-full rounded-full ${tc.cardAlt}`}>
                <div className="progress-shimmer h-2.5 rounded-full" style={{ width: '67%' }} />
              </div>
            </div>
            <p className={`text-[12px] italic ${tc.textMuted}`}>Checking against your playbook...</p>
          </div>

          <div className="space-y-2 pt-1">
            {[
              { label: 'MSA_Vendor_Counterparty_v3.docx', state: 'done' },
              { label: 'SHA_SeriesA_Investor_Markup.pdf', state: 'done' },
              { label: 'NDA_Mutual_Returned.docx', state: 'running' },
            ].map((p, i) => (
              <div key={p.label} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${tc.cardAlt}`}>
                <span className={`w-4 text-center text-[11px] font-bold ${tc.textMuted}`}>{i + 1}</span>
                <span className={`flex-1 text-[12px] ${tc.textSec}`}>{p.label}</span>
                {p.state === 'done' ? (
                  <span className="rounded-full border border-[#1DB954]/20 bg-[#1DB954]/10 px-3 py-0.5 text-[11px] font-semibold text-[#1DB954]">Complete</span>
                ) : (
                  <span className="animate-pulse rounded-full border border-[#FF6719]/20 bg-[#FF6719]/10 px-3 py-0.5 text-[11px] font-semibold text-[#FF6719]">Analyzing...</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </MockChrome>
  )
}

// ─── Mock screen 04 · Results dashboard ───────────────────────────────────────

function ScreenResults() {
  const total = DEMO_PAIRS.reduce((a, p) => a + p.total, 0)
  const high = DEMO_PAIRS.reduce((a, p) => a + p.high, 0)
  const med = DEMO_PAIRS.reduce((a, p) => a + p.medium, 0)
  const low = DEMO_PAIRS.reduce((a, p) => a + p.low, 0)
  const bars = [
    { label: 'High', count: high, color: '#FF4444' },
    { label: 'Medium', count: med, color: '#FF6719' },
    { label: 'Low', count: low, color: '#1DB954' },
  ]

  return (
    <MockChrome activeNav="New Analysis">
      <div className="flex h-full items-start gap-7">
        <div className="min-w-0 flex-1">
          <div className={`rounded-3xl border p-6 ${tc.card}`}>
            <div>
              <p className={`text-[17px] font-bold ${tc.text}`}>Results</p>
              <p className={`mt-0.5 text-[12px] ${tc.textMuted}`}>3 of 3 pairs analyzed</p>
            </div>
            <div className="mt-4 space-y-3">
              {DEMO_PAIRS.map((p) => (
                <div key={p.doc2} className={`rounded-3xl border p-5 ${tc.card}`}>
                  <div className="flex flex-col gap-3">
                    <div className="min-w-0">
                      <p className={`truncate text-[13px] font-semibold ${tc.text}`}>{p.doc2}</p>
                      <p className={`mt-0.5 truncate text-[11px] ${tc.textMuted}`}>compared with {p.doc1}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tc.textSec} ${tc.border}`}>{p.total} total</span>
                      <span className="rounded-full border border-[#FF4444]/20 bg-[#FF4444]/10 px-2.5 py-1 text-[11px] font-semibold text-[#FF4444]">{p.high} high</span>
                      <span className="rounded-full border border-[#FF6719]/20 bg-[#FF6719]/10 px-2.5 py-1 text-[11px] font-semibold text-[#FF6719]">{p.medium} med</span>
                      <span className="rounded-full border border-[#1DB954]/20 bg-[#1DB954]/10 px-2.5 py-1 text-[11px] font-semibold text-[#1DB954]">{p.low} low</span>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2.5">
                    <span className="rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] px-4 py-1.5 text-[11px] font-semibold text-white shadow-lg shadow-green-900/20">View details</span>
                    <span className={`rounded-2xl border px-4 py-1.5 text-[11px] font-semibold ${tc.cardAlt} ${tc.textSec}`}>Export report</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="w-[300px] flex-shrink-0 space-y-3">
          <div className={`space-y-3 rounded-3xl border p-5 ${tc.card}`}>
            <p className={`text-[13px] font-semibold ${tc.text}`}>Risk breakdown</p>
            <div className="space-y-3">
              {bars.map((b) => {
                const pct = Math.round((b.count / total) * 100)
                return (
                  <div key={b.label}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] font-semibold" style={{ color: b.color }}>{b.label}</span>
                      <span className="text-[11px] font-bold" style={{ color: b.color }}>
                        {b.count} <span className={`font-normal ${tc.textMuted}`}>({pct}%)</span>
                      </span>
                    </div>
                    <div className={`h-1.5 w-full rounded-full ${tc.cardAlt}`}>
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: b.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className={`flex items-center justify-between border-t pt-2 ${tc.border}`}>
              <span className={`text-[11px] ${tc.textMuted}`}>Total deviations</span>
              <span className={`text-[13px] font-bold ${tc.text}`}>{total}</span>
            </div>
          </div>
          <MockCard>
            <div className={`rounded-2xl border px-4 py-2.5 text-[12px] font-semibold ${tc.cardAlt} ${tc.textSec}`}>Start new analysis</div>
          </MockCard>
        </div>
      </div>
    </MockChrome>
  )
}

// ─── Mock screen 05 · Findings table ──────────────────────────────────────────

function ScreenFindings() {
  const headers = ['#', 'Clause', 'Term Sheet Position', 'Received Draft', 'Risk', 'Explanation', 'Suggested Response (from Playbook)']
  return (
    <MockChrome activeNav="New Analysis">
      <div className="flex h-full items-start gap-7">
        <div className="min-w-0 flex-1">
          <div className={`space-y-4 rounded-3xl border p-5 ${tc.card}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className={`truncate text-[17px] font-bold ${tc.text}`}>MSA_Vendor_Counterparty_v3.docx</p>
                <p className={`mt-0.5 text-[11px] ${tc.textMuted}`}>compared with MSA_Vendor_Firm_Draft.docx</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${tc.cardAlt} ${tc.text}`}>14 deviations</span>
                  <span className="rounded-full border border-[#FF4444]/20 bg-[#FF4444]/10 px-3 py-1 text-[11px] font-semibold text-[#FF4444]">3 high</span>
                  <span className="rounded-full border border-[#FF6719]/20 bg-[#FF6719]/10 px-3 py-1 text-[11px] font-semibold text-[#FF6719]">6 medium</span>
                  <span className="rounded-full border border-[#1DB954]/20 bg-[#1DB954]/10 px-3 py-1 text-[11px] font-semibold text-[#1DB954]">5 low</span>
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] px-5 py-2 text-[12px] font-semibold text-white shadow-lg shadow-green-900/20">Export report</div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-[#FF6719]/20 bg-[#FF6719]/5 px-4 py-2.5">
              <span className="mt-0.5 text-[13px]">⚠️</span>
              <p className="text-[11px] leading-relaxed">
                <span className="font-bold text-[#FF6719]">No suggested response on a row?</span>
                <span className={tc.textSec}> That clause has not been configured in your Playbook yet. </span>
                <span className="font-semibold text-[#FF6719] underline underline-offset-2">Open Playbook</span>
                <span className={tc.textSec}> to add a position and suggested response for it.</span>
              </p>
            </div>

            <div className={`overflow-hidden rounded-3xl border ${tc.border} ${tc.input}`}>
              <table className="w-full table-fixed text-left">
                <thead>
                  <tr className={tc.cardAlt}>
                    {headers.map((h, i) => (
                      <th
                        key={h}
                        className={`px-3 py-2.5 text-[9px] font-semibold uppercase tracking-widest ${tc.textMuted}`}
                        style={{ width: ['3%', '13%', '17%', '17%', '7%', '17%', '26%'][i] }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEMO_DEVIATIONS.map((d, i) => (
                    <tr key={d.clause} className={`border-t ${tc.border}`}>
                      <td className={`px-3 py-3 align-top text-[11px] ${tc.textMuted}`}>{i + 1}</td>
                      <td className={`px-3 py-3 align-top text-[11px] font-semibold ${tc.text}`}>
                        <div className="flex flex-col gap-1">
                          <span>{d.clause}</span>
                          <MockType type={d.type} />
                        </div>
                      </td>
                      <td className={`px-3 py-3 align-top text-[11px] leading-snug ${tc.textSec}`}>{d.ours}</td>
                      <td className={`px-3 py-3 align-top text-[11px] leading-snug ${tc.textSec}`}>{d.theirs}</td>
                      <td className="px-3 py-3 align-top"><MockRisk level={d.risk} /></td>
                      <td className={`px-3 py-3 align-top text-[11px] leading-snug ${tc.textSec}`}>{d.why}</td>
                      <td className="px-3 py-3 align-top">
                        {d.response ? (
                          <div className="space-y-1.5">
                            <p className={`text-[8px] font-semibold uppercase tracking-widest ${tc.textMuted}`}>Our position</p>
                            <p className={`text-[10px] leading-snug ${tc.textSec}`}>{d.position}</p>
                            <p className="text-[8px] font-semibold uppercase tracking-widest text-[#1DB954]">Suggested response</p>
                            <p className={`text-[10px] leading-snug ${tc.textSec}`}>{d.response}</p>
                            <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold ${tc.cardAlt} ${tc.textSec}`}>Copy</span>
                          </div>
                        ) : (
                          <p className={`text-[10px] italic ${tc.textMuted}`}>No Playbook entry configured for this clause</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="w-[240px] flex-shrink-0 space-y-3">
          <MockCard title="Filter by type">
            <div className="space-y-2">
              {[
                { label: 'All deviations', count: 14, active: true },
                { label: 'Modified', count: 8, active: false },
                { label: 'Added', count: 4, active: false },
                { label: 'Omitted', count: 2, active: false },
              ].map((f) => (
                <div
                  key={f.label}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-[12px] ${
                    f.active ? 'border-[#1DB954]/30 bg-[#1DB954]/10 text-[#1DB954] font-semibold' : `${tc.cardAlt} ${tc.textSec}`
                  }`}
                >
                  <span>{f.label}</span>
                  <span className="font-bold">{f.count}</span>
                </div>
              ))}
            </div>
          </MockCard>
          <MockCard title="Highest exposure">
            <p className="text-[11px]">Two high-risk rows sit in liability and indemnity. Both are flagged as dealbreakers in your playbook.</p>
          </MockCard>
        </div>
      </div>
    </MockChrome>
  )
}

// ─── Mock screen 06 · Playbook ────────────────────────────────────────────────

const PLAYBOOK_PREVIEW = [
  {
    clause: 'Indemnity',
    position: 'Mutual indemnity capped at contract value, with carve-outs for gross negligence and wilful misconduct.',
    dealbreaker: 'Unilateral broad indemnity with no cap.',
    response: 'We propose mutual indemnity with a cap equal to fees paid in the preceding 12 months. Happy to discuss carve-outs for IP infringement.',
  },
  {
    clause: 'Limitation of Liability',
    position: 'Liability cap at 100% of contract value. Exclusion of consequential, indirect, and punitive damages.',
    dealbreaker: 'Unlimited liability or removal of consequential loss exclusion.',
    response: 'Our standard position excludes consequential and indirect loss and caps aggregate liability at contract value.',
  },
  {
    clause: 'Data Protection',
    position: 'Compliance with DPDP Act 2023; DPA where the counterparty is a processor; breach notification within 72 hours.',
    dealbreaker: 'No data protection obligations or a breach window exceeding 7 days.',
    response: 'As a data fiduciary under the DPDP Act, we require a compliant DPA and a 72-hour breach notification window as a non-negotiable baseline.',
  },
]

function ScreenPlaybook() {
  return (
    <MockChrome url="deviate.app/playbook" activeNav="Playbook">
      <div className="mx-auto h-full w-[860px]">
        <div className="mb-4">
          <p className={`text-[21px] font-bold ${tc.text}`}>Playbook</p>
          <p className={`mt-0.5 text-[12px] ${tc.textMuted}`}>Clause-level positions and suggested responses used during AI analysis.</p>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-2xl border border-[#1DB954]/20 bg-[#1DB954]/5 px-5 py-3">
          <p className="text-[12px] text-[#1DB954]">8 clause entries configured · used automatically in every analysis</p>
          <span className="rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] px-4 py-1.5 text-[11px] font-semibold text-white">+ New clause entry</span>
        </div>

        <div className="space-y-3">
          {PLAYBOOK_PREVIEW.map((e) => (
            <div key={e.clause} className={`rounded-3xl border p-5 ${tc.card}`}>
              <div className="mb-3 flex items-center justify-between">
                <p className={`text-[14px] font-bold ${tc.text}`}>{e.clause}</p>
                <div className="flex gap-2">
                  <span className={`rounded-xl border px-3 py-1 text-[10px] font-semibold ${tc.cardAlt} ${tc.textSec}`}>Edit</span>
                  <span className="rounded-xl border border-[#FF4444]/20 bg-[#FF4444]/5 px-3 py-1 text-[10px] font-semibold text-[#FF4444]">Delete</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className={`text-[8px] font-semibold uppercase tracking-widest ${tc.textMuted}`}>Preferred position</p>
                  <p className={`mt-1 text-[11px] leading-snug ${tc.textSec}`}>{e.position}</p>
                </div>
                <div>
                  <p className="text-[8px] font-semibold uppercase tracking-widest text-[#FF4444]/80">Dealbreaker</p>
                  <p className={`mt-1 text-[11px] leading-snug ${tc.textSec}`}>{e.dealbreaker}</p>
                </div>
                <div>
                  <p className="text-[8px] font-semibold uppercase tracking-widest text-[#1DB954]">Suggested response</p>
                  <p className={`mt-1 text-[11px] leading-snug ${tc.textSec}`}>{e.response}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MockChrome>
  )
}

// ─── Demo steps ───────────────────────────────────────────────────────────────

const DEMO_STEPS = [
  {
    n: '01',
    tab: 'Upload',
    title: 'Upload both sides of the matter',
    body: 'Drop in every document your firm prepared and every version that came back. PDF and DOCX, several files at a time. Tracked changes are read natively, so a pending redline does not need to be accepted first.',
    Screen: ScreenUpload,
  },
  {
    n: '02',
    tab: 'Pair',
    title: 'Pair documents in one pass',
    body: 'Deviate proposes a match for each firm document with a confidence score drawn from filename similarity. Override any suggestion from the dropdown, or skip documents you are not reviewing this session.',
    Screen: ScreenPairing,
  },
  {
    n: '03',
    tab: 'Analyse',
    title: 'The engine reads for meaning',
    body: 'Both documents are read in full and compared clause by clause. This is not a word-level diff: the analysis identifies what was modified, added or omitted, and what each change does commercially.',
    Screen: ScreenAnalyzing,
  },
  {
    n: '04',
    tab: 'Results',
    title: 'A dashboard for the whole matter',
    body: 'Every pair lands in one place with its risk split. See instantly which document came back clean and which one needs a partner on it before the call.',
    Screen: ScreenResults,
  },
  {
    n: '05',
    tab: 'Findings',
    title: 'Every deviation, with your answer attached',
    body: 'The findings table shows the clause, what you sent, what came back, the risk rating, the commercial consequence, and your firm’s standard pushback language ready to copy. Filter by risk or deviation type to work the list down.',
    Screen: ScreenFindings,
  },
  {
    n: '06',
    tab: 'Playbook',
    title: 'Your positions, applied automatically',
    body: 'The Playbook holds your firm’s preferred position, dealbreakers and drafted response for each clause type. Configure it once and every future analysis fills the response column on its own.',
    Screen: ScreenPlaybook,
  },
]

// ─── Landing sections ─────────────────────────────────────────────────────────

function SectionHeading({ eyebrow, title, sub, align = 'center' }) {
  return (
    <div className={`max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
      {eyebrow && (
        <Reveal y={10} duration={500}>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[#1DB954]">{eyebrow}</p>
        </Reveal>
      )}
      <Reveal delay={90}>
        <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${tc.text}`}>{title}</h2>
      </Reveal>
      {sub && (
        <Reveal delay={190} y={14}>
          <p className={`mt-4 text-base leading-relaxed ${tc.textSec}`}>{sub}</p>
        </Reveal>
      )}
    </div>
  )
}

const FEATURES = [
  {
    accent: 'green',
    title: 'Meaning, not word-diff',
    body: 'A redline tells you a word moved. Deviate tells you the liability cap is gone, and what that costs on this deal.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21a48.309 48.309 0 01-8.135-.687c-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    ),
  },
  {
    accent: 'orange',
    title: 'Risk triage on every row',
    body: 'High, Medium and Low ratings assigned from the nature of the clause and the size of the change. Filter straight to the rows that decide the negotiation.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    ),
  },
  {
    accent: 'green',
    title: 'Your playbook, applied',
    body: 'Each deviation is matched against your firm’s standard position and pre-drafted response. Copy it into the reply to opposing counsel without opening a precedent bank.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    ),
  },
  {
    accent: 'orange',
    title: 'Whole matters, not single files',
    body: 'Upload everything on both sides at once. Deviate pairs the documents and analyses the batch together, then reports on the matter as a whole.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
    ),
  },
  {
    accent: 'green',
    title: 'Redline-native ingestion',
    body: 'DOCX files carrying pending tracked changes are read as they arrive. No accepting revisions, no cleaning up markup before the review starts.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    ),
  },
  {
    accent: 'orange',
    title: 'Client-ready export',
    body: 'One click produces a formatted Word report: cover page, executive summary with the risk split, the full findings table, and a reviewed-by signature line.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    ),
  },
]

const RISK_LEVELS = [
  {
    level: 'High',
    color: '#FF4444',
    headline: 'Move it to the top of the call',
    body: 'A change with significant commercial or legal consequence: a liability cap removed, an uncapped indemnity inserted, a governing law swapped without reason.',
  },
  {
    level: 'Medium',
    color: '#FF6719',
    headline: 'Meaningful, and negotiable',
    body: 'Changes that matter but sit inside the trading range: a longer notice period, a wider arbitration panel, a restraint stretched beyond what was agreed.',
  },
  {
    level: 'Low',
    color: '#1DB954',
    headline: 'Note it and move on',
    body: 'Minor variations unlikely to move the deal: drafting tidy-ups, reordered definitions, clauses whose effect is already covered by statute.',
  },
]

const FAQS = [
  {
    q: 'What types of documents does Deviate work with?',
    a: 'Deviate is designed for Indian corporate law documents including term sheets, NDAs, vendor agreements, shareholder agreements, employment contracts, and any other bilateral commercial agreements. It performs best on structured legal documents with clearly delineated clauses.',
  },
  {
    q: 'How accurate is the AI analysis?',
    a: 'Deviate is trained to identify material deviations in standard Indian corporate law clause types. It is highly accurate for common clauses such as indemnity, limitation of liability, non-compete, governing law, and dispute resolution. All output should be reviewed by a qualified legal professional before reliance. Deviate is a tool to accelerate review, not replace it.',
  },
  {
    q: 'What is the Playbook and how do I configure it?',
    a: 'The Playbook is your firm’s internal library of standard positions on common clause types. For each clause type you define your preferred position, what constitutes a dealbreaker, and suggested negotiation language. When Deviate identifies a deviation it matches the clause against your Playbook and surfaces the relevant position and response automatically.',
  },
  {
    q: 'Are my documents stored or shared?',
    a: 'Documents are processed in memory during analysis and are not stored on Deviate’s servers. Saved reviews are stored locally in your browser and are not accessible to any other user or device. For matters involving highly sensitive documents, review your firm’s data handling policies before use.',
  },
  {
    q: 'Can I analyse multiple document pairs at once?',
    a: 'Yes. Upload multiple firm documents and multiple counterparty documents simultaneously. In the pairing step each firm document is matched to its counterparty version, all confirmed pairs are analysed in a single batch, and the results are presented together.',
  },
  {
    q: 'What do the risk levels mean?',
    a: 'High risk indicates a deviation with significant potential commercial or legal consequence. Medium risk covers deviations that are meaningful but negotiable. Low risk covers minor variations unlikely to materially affect the transaction. Risk levels are assigned from the nature of the clause and the extent of the change.',
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  const { dark, toggle: toggleTheme } = useTheme()
  const [step, setStep] = useState(0)
  const [autoplay, setAutoplay] = useState(true)
  const [openFaq, setOpenFaq] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!autoplay) return
    const id = setInterval(() => setStep((s) => (s + 1) % DEMO_STEPS.length), 7000)
    return () => clearInterval(id)
  }, [autoplay])

  const pickStep = (i) => { setAutoplay(false); setStep(i) }

  const active = DEMO_STEPS[step]
  const ActiveScreen = active.Screen

  const navLinks = [
    { label: 'Walkthrough', href: '#demo' },
    { label: 'Capabilities', href: '#features' },
    { label: 'Playbook', href: '#playbook' },
    { label: 'FAQ', href: '#faq' },
  ]

  return (
    <div className={`min-h-screen ${tc.bg} ${tc.text} transition-colors duration-300`}>

      {/* ── Header ── */}
      <header className={`sticky top-0 z-50 border-b ${tc.border} bg-[var(--bg)]/80 backdrop-blur-xl`}>
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex flex-col items-start gap-0 transition-opacity hover:opacity-80">
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-extrabold tracking-tight text-[#1DB954]">◆</span>
              <span className={`text-xl font-extrabold tracking-tight ${tc.text}`}>deviate</span>
              <span className="rounded-full border border-[#1DB954]/30 bg-[#1DB954]/10 px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide text-[#1DB954]">v1</span>
            </div>
            <p className="flicker-tagline pl-6 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">AI‑Powered Negotiation Risk Analysis</p>
          </a>

          <nav className="flex items-center gap-1">
            <div className="hidden items-center gap-1 md:flex">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all duration-200 hover:text-[#1DB954] ${tc.textSec}`}
                >
                  {l.label}
                </a>
              ))}
            </div>

            <div className="ml-1 flex items-center gap-2 sm:ml-2">
              <a
                href="/app"
                className="rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-green-900/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-green-900/40"
              >
                Launch app
              </a>

              <button
                type="button"
                onClick={toggleTheme}
                className={`flex h-9 w-9 items-center justify-center rounded-2xl border transition-all duration-200 hover:scale-105 ${tc.card}`}
                aria-label="Toggle theme"
              >
                {dark ? (
                  <svg className="h-4 w-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                  </svg>
                )}
              </button>

              {/* Mobile menu */}
              <div className="relative md:hidden">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className={`flex h-9 w-9 items-center justify-center rounded-2xl border transition-all duration-200 ${tc.card}`}
                  aria-label="Menu"
                >
                  <svg className={`h-4 w-4 ${tc.textMuted}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {menuOpen
                      ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
                  </svg>
                </button>
                {menuOpen && (
                  <div className={`animate-scale-in absolute right-0 top-11 z-50 w-48 rounded-2xl border shadow-2xl ${tc.card}`}>
                    {navLinks.map((l) => (
                      <a
                        key={l.href}
                        href={l.href}
                        onClick={() => setMenuOpen(false)}
                        className={`block border-b px-4 py-3 text-sm font-medium last:border-0 hover:text-[#1DB954] ${tc.border} ${tc.textSec}`}
                      >
                        {l.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-70"
            style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(29,185,84,0.16) 0%, rgba(255,103,25,0.06) 45%, transparent 75%)' }}
          />
          <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
            <div className="mx-auto max-w-3xl text-center">
              <span className={`animate-pop-in inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold ${tc.card} ${tc.textSec}`} style={{ animationDelay: '60ms' }}>
                <span className="text-[#1DB954]">◆</span>
                Built by a lawyer, for lawyers
              </span>
              <h1 className={`mx-auto mt-6 max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl ${tc.text}`}>
                <span className="animate-rise-in block" style={{ animationDelay: '160ms' }}>Every clause they changed.</span>
                <span className="animate-rise-in block" style={{ animationDelay: '290ms' }}>
                  <span className="text-[#1DB954]">Ranked by what it </span>
                  <span className="text-[#FF6719]">costs you.</span>
                </span>
              </h1>
              <p className={`animate-rise-in mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg ${tc.textSec}`} style={{ animationDelay: '430ms' }}>
                Deviate reads your draft against the counterparty&apos;s markup, flags every omission, addition and modification, rates the commercial risk of each one, and hands you your firm&apos;s standard response ready to send. Under a minute per document pair.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="/app"
                  className="animate-pop-in group w-full rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-green-900/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-green-900/40 sm:w-auto"
                  style={{ animationDelay: '560ms' }}
                >
                  Launch Deviate <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">→</span>
                </a>
                <a
                  href="#demo"
                  className={`animate-pop-in w-full rounded-2xl border px-8 py-3.5 text-center text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:border-[#FF6719]/40 hover:text-[#FF6719] sm:w-auto ${tc.card} ${tc.textSec}`}
                  style={{ animationDelay: '650ms' }}
                >
                  Walk through the demo
                </a>
              </div>
              <p className={`animate-fade-in mt-5 text-xs ${tc.textMuted}`} style={{ animationDelay: '760ms', animationFillMode: 'both' }}>
                PDF &amp; DOCX · Tracked changes read natively · Documents never stored on our servers
              </p>
            </div>

            {/* Hero screenshot */}
            <div className="animate-screen-in mt-14" style={{ animationDelay: '820ms' }}>
              <div className="relative mx-auto max-w-5xl">
                <div
                  className="pointer-events-none absolute -inset-6 rounded-[2.5rem] opacity-60 blur-2xl"
                  style={{ background: 'linear-gradient(120deg, rgba(29,185,84,0.22), rgba(255,103,25,0.16))' }}
                />
                <div className={`relative overflow-hidden rounded-3xl border shadow-2xl ${tc.card}`}>
                  <ScreenScaler><ScreenFindings /></ScreenScaler>
                </div>

                {/* Floating accents */}
                <div className={`animate-badge-in absolute -bottom-5 -left-5 hidden rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl lg:block ${tc.card}`} style={{ animationDelay: '1550ms' }}>
                  <p className={`text-[10px] font-semibold uppercase tracking-widest ${tc.textMuted}`}>Liability cap</p>
                  <p className="mt-1 text-sm font-bold text-[#FF4444]">Deleted · High risk</p>
                </div>
                <div className={`animate-badge-in absolute -right-5 -top-5 hidden rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl lg:block ${tc.card}`} style={{ animationDelay: '1680ms' }}>
                  <p className={`text-[10px] font-semibold uppercase tracking-widest ${tc.textMuted}`}>Response drafted</p>
                  <p className="mt-1 text-sm font-bold text-[#1DB954]">From your playbook</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stat strip ── */}
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-24">
          <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-3xl border lg:grid-cols-4 ${tc.card}`} style={{ background: 'var(--border)' }}>
            {[
              { value: 'Under 60s', label: 'per document pair, end to end' },
              { value: '3 types', label: 'modified, added and omitted clauses' },
              { value: '8 clauses', label: 'preloaded playbook positions' },
              { value: '.docx', label: 'client-ready report on one click' },
            ].map((stat, i) => (
              <Reveal key={stat.value} delay={i * 110} y={14} scale={0.97} duration={520} className="bg-[var(--bg-card)]">
                <div className="h-full px-6 py-7">
                  <p className="text-2xl font-extrabold tracking-tight text-[#1DB954] sm:text-3xl">{stat.value}</p>
                  <p className={`mt-1.5 text-xs leading-relaxed ${tc.textMuted}`}>{stat.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Demo walkthrough ── */}
        <section id="demo" className="scroll-mt-24 border-y bg-[var(--bg-card)]/40 py-16 sm:py-24" style={{ borderColor: 'var(--border)' }}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="The walkthrough"
              title="Six screens, one matter"
              sub="This is the entire workflow, from three documents on each side to a report you can put in front of a client. Pick a step, or let it play."
            />

            <div className="mt-12">
              <div className="grid gap-8 lg:grid-cols-[300px_1fr] lg:items-start">

                {/* Step rail */}
                <div className="space-y-2">
                  {/* mobile: horizontal chips */}
                  <div className="flex gap-2 overflow-x-auto pb-2 lg:hidden">
                    {DEMO_STEPS.map((s, i) => (
                      <button
                        key={s.n}
                        type="button"
                        onClick={() => pickStep(i)}
                        className={`flex-shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-all duration-200 ${
                          i === step
                            ? 'border-transparent bg-gradient-to-r from-[#1DB954] to-[#169C46] text-white shadow-lg shadow-green-900/20'
                            : `${tc.card} ${tc.textMuted}`
                        }`}
                      >
                        {s.n} · {s.tab}
                      </button>
                    ))}
                  </div>

                  {/* desktop: list */}
                  <div className="hidden space-y-2 lg:block">
                    {DEMO_STEPS.map((s, i) => {
                      const on = i === step
                      return (
                        <Reveal key={s.n} delay={i * 80} x={-16} y={0} duration={520}>
                          <button
                            type="button"
                            data-demo-step={i}
                            onClick={() => pickStep(i)}
                            className={`w-full rounded-2xl border p-4 text-left transition-all duration-300 ${
                              on
                                ? 'translate-x-1 border-[#1DB954]/40 bg-[#1DB954]/[0.06]'
                                : `${tc.card} hover:translate-x-1 hover:border-[var(--border-hover)]`
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-bold transition-all duration-300 ${
                                  on ? 'scale-110 bg-[#1DB954] text-black' : `${tc.cardAlt} ${tc.textMuted}`
                                }`}
                              >
                                {s.n}
                              </span>
                              <span className={`text-sm font-semibold transition-colors duration-300 ${on ? 'text-[#1DB954]' : tc.text}`}>{s.tab}</span>
                              {on && autoplay && (
                                <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-[#FF6719]" />
                              )}
                            </div>
                          </button>
                        </Reveal>
                      )
                    })}
                  </div>

                  <Reveal delay={520} className="hidden lg:block">
                    <div key={`detail-${step}`} className={`animate-fade-in rounded-2xl border p-4 ${tc.cardAlt}`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-widest ${tc.textMuted}`}>Step {active.n}</p>
                      <p className={`mt-1.5 text-sm font-bold ${tc.text}`}>{active.title}</p>
                      <p className={`mt-2 text-xs leading-relaxed ${tc.textSec}`}>{active.body}</p>
                    </div>
                  </Reveal>
                </div>

                {/* Screenshot */}
                <div>
                  <Reveal delay={140} y={26} scale={0.985} duration={720}>
                    <div className={`overflow-hidden rounded-3xl border shadow-2xl ${tc.card}`}>
                      <div key={step} className="animate-screen-swap">
                        <ScreenScaler><ActiveScreen /></ScreenScaler>
                      </div>
                    </div>
                  </Reveal>
                  <div className={`mt-4 rounded-2xl border p-4 lg:hidden ${tc.cardAlt}`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-widest ${tc.textMuted}`}>Step {active.n}</p>
                    <p className={`mt-1.5 text-sm font-bold ${tc.text}`}>{active.title}</p>
                    <p className={`mt-2 text-xs leading-relaxed ${tc.textSec}`}>{active.body}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="scroll-mt-24 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading
                eyebrow="Capabilities"
                title="Built around how the review actually happens"
                sub="Not a diff viewer with a chat box bolted on. Every part of Deviate exists because a junior associate was doing it by hand at eleven at night."
              />

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => {
                const green = f.accent === 'green'
                return (
                  <Reveal key={f.title} delay={i * 90} y={24} scale={0.975}>
                    <div className={`card-hover group h-full rounded-3xl border p-6 ${tc.card}`}>
                      <div
                        className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
                        style={{ background: green ? 'rgba(29,185,84,0.10)' : 'rgba(255,103,25,0.10)' }}
                      >
                        <svg
                          className="h-5 w-5"
                          style={{ color: green ? '#1DB954' : '#FF6719' }}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                        >
                          {f.icon}
                        </svg>
                      </div>
                      <p className={`text-base font-bold ${tc.text}`}>{f.title}</p>
                      <p className={`mt-2 text-sm leading-relaxed ${tc.textSec}`}>{f.body}</p>
                    </div>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Risk model ── */}
        <section id="risk" className="scroll-mt-24 border-y bg-[var(--bg-card)]/40 py-16 sm:py-24" style={{ borderColor: 'var(--border)' }}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading
                eyebrow="Risk model"
                title="Three ratings, so you know what to argue first"
                sub="Fourteen deviations in a master services agreement are not fourteen problems. Deviate sorts them so the partner sees the three that matter."
              />

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {RISK_LEVELS.map((r, i) => (
                <Reveal key={r.level} delay={i * 110} y={26} scale={0.975}>
                  <div
                    className="h-full rounded-3xl border p-6 transition-all duration-300 hover:-translate-y-1.5"
                    style={{ borderColor: `${r.color}33`, background: `${r.color}0D` }}
                  >
                    <span
                      className="inline-flex rounded-full border px-3 py-1 text-xs font-bold"
                      style={{ color: r.color, borderColor: `${r.color}33`, background: `${r.color}1A` }}
                    >
                      {r.level} risk
                    </span>
                    <p className={`mt-4 text-lg font-bold ${tc.text}`}>{r.headline}</p>
                    <p className={`mt-2 text-sm leading-relaxed ${tc.textSec}`}>{r.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Playbook deep dive ── */}
        <section id="playbook" className="scroll-mt-24 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,400px)_1fr] lg:items-center">
              <div>
                <Reveal y={10} duration={500}>
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[#FF6719]">The Playbook</p>
                </Reveal>
                <Reveal delay={90}>
                  <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${tc.text}`}>
                    Configure your positions once. Reuse them on every matter.
                  </h2>
                </Reveal>
                <Reveal delay={190} y={14}>
                <p className={`mt-5 text-base leading-relaxed ${tc.textSec}`}>
                  The Playbook is a library of your firm&apos;s standard stance on each clause type. When an analysis turns up a deviation in a clause you have configured, the findings table fills in two columns on its own: what your firm&apos;s position is, and the negotiation language to send back.
                </p>
                </Reveal>

                <div className="mt-8 space-y-4">
                  {[
                    { label: 'Clause type', color: '#1DB954', desc: 'The clause name Deviate matches deviations against — Indemnity, Non-Compete, Governing Law.' },
                    { label: 'Preferred position', color: 'var(--text-secondary)', desc: 'What your firm would insist on in a negotiation on this clause.' },
                    { label: 'Dealbreaker', color: '#FF4444', desc: 'Formulations that are categorically unacceptable, surfaced as a flag during analysis.' },
                    { label: 'Suggested response', color: '#FF6719', desc: 'Pre-drafted pushback language, copied straight into the reply to opposing counsel.' },
                  ].map((row, i) => (
                    <Reveal key={row.label} delay={260 + i * 90} x={-14} y={0} duration={520}>
                      <div className={`flex gap-4 pb-4 ${i === 3 ? '' : `border-b ${tc.border}`}`}>
                        <span className="w-36 flex-shrink-0 text-sm font-bold" style={{ color: row.color }}>{row.label}</span>
                        <p className={`text-sm leading-relaxed ${tc.textMuted}`}>{row.desc}</p>
                      </div>
                    </Reveal>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap gap-2">
                  {['Indemnity', 'Limitation of Liability', 'Non-Compete', 'Governing Law', 'Dispute Resolution', 'Confidentiality', 'Termination', 'Data Protection'].map((c, i) => (
                    <Reveal key={c} delay={620 + i * 55} y={8} scale={0.9} duration={420}>
                      <span className="inline-block rounded-full border border-[#1DB954]/20 bg-[#1DB954]/5 px-3 py-1 text-[11px] font-semibold text-[#1DB954] transition-colors duration-200 hover:border-[#1DB954]/40 hover:bg-[#1DB954]/10">{c}</span>
                    </Reveal>
                  ))}
                </div>

                <Reveal delay={1080} y={12}>
                  <a
                    href="/playbook"
                    className="group mt-8 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF6719] to-[#FF4500] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-900/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-orange-900/40"
                  >
                    Open the Playbook editor
                    <svg className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </a>
                </Reveal>
              </div>

              <Reveal delay={160} y={30} scale={0.98} duration={760}>
                <div className={`overflow-hidden rounded-3xl border shadow-2xl ${tc.card}`}>
                  <ScreenScaler><ScreenPlaybook /></ScreenScaler>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Export ── */}
        <section id="export" className="scroll-mt-24 border-y bg-[var(--bg-card)]/40 py-16 sm:py-24" style={{ borderColor: 'var(--border)' }}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <Reveal y={30} scale={0.97} duration={780} className="order-2 lg:order-1">
                {/* Mock report page */}
                <div className="relative mx-auto max-w-md">
                  <div
                    className="pointer-events-none absolute -inset-4 rounded-[2rem] opacity-50 blur-2xl"
                    style={{ background: 'linear-gradient(140deg, rgba(29,185,84,0.20), rgba(255,103,25,0.14))' }}
                  />
                  <div className="relative rounded-2xl bg-white p-8 shadow-2xl" style={{ color: '#111318' }}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-extrabold text-[#1DB954]">◆</span>
                      <span className="text-sm font-extrabold tracking-tight">deviate</span>
                    </div>
                    <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.22em] text-[#6B6B6B]">Deviation analysis report</p>
                    <p className="mt-2 text-xl font-extrabold leading-tight">MSA_Vendor_Counterparty_v3.docx</p>
                    <p className="mt-1 text-xs text-[#4A5066]">compared with MSA_Vendor_Firm_Draft.docx</p>

                    <div className="mt-7 border-t border-[#E2E4E9] pt-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#6B6B6B]">Executive summary</p>
                      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                        {[
                          { v: '14', l: 'Total', c: '#111318' },
                          { v: '3', l: 'High', c: '#FF4444' },
                          { v: '6', l: 'Medium', c: '#FF6719' },
                          { v: '5', l: 'Low', c: '#1DB954' },
                        ].map((s) => (
                          <div key={s.l} className="rounded-lg bg-[#F4F5F7] py-2.5">
                            <p className="text-base font-extrabold" style={{ color: s.c }}>{s.v}</p>
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-[#8890A4]">{s.l}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 space-y-2">
                      {['Limitation of Liability — cap deleted', 'Indemnity — unilateral and uncapped', 'Dispute Resolution — seat moved to London'].map((line, i) => (
                        <div key={line} className="flex items-start gap-2 border-b border-[#F0F1F3] pb-2 last:border-0">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: i < 2 ? '#FF4444' : '#FF6719' }} />
                          <p className="text-[11px] leading-snug text-[#4A5066]">{line}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-8 border-t border-[#E2E4E9] pt-4">
                      <p className="text-[9px] uppercase tracking-[0.18em] text-[#8890A4]">Reviewed by</p>
                      <div className="mt-5 h-px w-40 bg-[#C8CBD4]" />
                    </div>
                  </div>
                </div>
              </Reveal>

              <div className="order-1 lg:order-2">
                <Reveal y={10} duration={500}>
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[#1DB954]">The deliverable</p>
                </Reveal>
                <Reveal delay={90}>
                  <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${tc.text}`}>
                    Walk out with a report, not a browser tab
                  </h2>
                </Reveal>
                <Reveal delay={190} y={14}>
                <p className={`mt-5 text-base leading-relaxed ${tc.textSec}`}>
                  Each document pair exports as a formatted Word file: a cover page naming both documents, an executive summary with the risk split, the complete findings table carrying your playbook positions and suggested responses, and a reviewed-by signature line for the instructed counsel.
                </p>
                </Reveal>
                <div className="mt-8 space-y-3">
                  {[
                    'Preview exactly what goes into the report before it generates',
                    'Formatted for a client email or the internal matter file as-is',
                    'Carries the AI disclaimer and reads as attorney work product',
                    'Saved reviews stay in your browser, ready to re-open and re-export',
                  ].map((line, i) => (
                    <Reveal key={line} delay={280 + i * 90} x={-12} y={0} duration={500}>
                      <div className="flex gap-3">
                        <span className="mt-1.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#1DB954]/15 text-[9px] font-bold text-[#1DB954]">✓</span>
                        <span className={`text-sm leading-relaxed ${tc.textSec}`}>{line}</span>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="scroll-mt-24 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <SectionHeading eyebrow="Questions" title="Before you upload anything" />

            <div className="mt-10 space-y-2">
              {FAQS.map((faq, i) => (
                <Reveal key={faq.q} delay={i * 70} y={14} duration={520}>
                  <div className={`overflow-hidden rounded-2xl border transition-colors duration-200 hover:border-[var(--border-hover)] ${tc.cardAlt}`}>
                    <button
                      type="button"
                      data-faq={i}
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[#1DB954]/[0.03]"
                    >
                      <span className={`text-sm font-semibold ${tc.text}`}>{faq.q}</span>
                      <span className={`flex-shrink-0 text-lg font-light transition-transform duration-200 ${openFaq === i ? 'rotate-45 text-[#1DB954]' : tc.textMuted}`}>+</span>
                    </button>
                    {openFaq === i && (
                      <div className={`border-t px-5 pb-4 ${tc.border}`}>
                        <p className={`pt-3 text-xs leading-relaxed ${tc.textSec}`}>{faq.a}</p>
                      </div>
                    )}
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal delay={120}>
              <div className="mt-6 rounded-2xl border border-[#1DB954]/20 bg-[#1DB954]/5 p-5">
                <p className="mb-1 text-xs font-semibold text-[#1DB954]">Disclaimer</p>
                <p className="text-xs leading-relaxed text-[#1DB954]/70">
                  Deviate is an AI-assisted legal analysis tool. All output is generated automatically and must be reviewed by a qualified legal professional before reliance. Deviate does not constitute legal advice. Findings should be treated as attorney work product and handled accordingly.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section id="cta" className="scroll-mt-24 px-4 pb-20 sm:px-6">
          <Reveal>
            <div
              className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] border p-10 text-center sm:p-16"
              style={{ borderColor: 'rgba(29,185,84,0.25)', background: 'linear-gradient(135deg, rgba(29,185,84,0.12), rgba(255,103,25,0.08))' }}
            >
              <Reveal>
                <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${tc.text}`}>
                  Ready to spot what they changed?
                </h2>
              </Reveal>
              <Reveal delay={120} y={14}>
                <p className={`mx-auto mt-4 max-w-xl text-base leading-relaxed ${tc.textSec}`}>
                  Upload both sides of your next matter and have the full deviation report before the pre-call brief is written.
                </p>
              </Reveal>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Reveal delay={240} y={12} scale={0.96} duration={520}>
                  <a
                    href="/app"
                    className="group block w-full rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-green-900/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-green-900/40 sm:w-auto"
                  >
                    Launch Deviate <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">→</span>
                  </a>
                </Reveal>
                <Reveal delay={330} y={12} scale={0.96} duration={520}>
                  <a
                    href="mailto:rishabrsid@gmail.com"
                    className={`block w-full rounded-2xl border px-8 py-3.5 text-center text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:border-[#FF6719]/40 hover:text-[#FF6719] sm:w-auto ${tc.card} ${tc.textSec}`}
                  >
                    Talk to the builder
                  </a>
                </Reveal>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className={`border-t ${tc.border}`}>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-extrabold text-[#1DB954]">◆</span>
                <span className={`text-lg font-extrabold tracking-tight ${tc.text}`}>deviate</span>
                <span className="rounded-full border border-[#1DB954]/30 bg-[#1DB954]/10 px-1.5 py-0.5 text-[9px] font-bold leading-none text-[#1DB954]">v1</span>
              </div>
              <p className={`mt-1 text-xs ${tc.textMuted}`}>AI-Powered Negotiation Risk Analysis</p>
              <div className="mt-1 flex items-center gap-2">
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
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {[
                { label: 'Launch app', href: '/app' },
                { label: 'Playbook', href: '/playbook' },
                { label: 'Walkthrough', href: '#demo' },
                { label: 'FAQ', href: '#faq' },
              ].map((l) => (
                <a key={l.label} href={l.href} className={`text-xs transition-colors hover:text-[#1DB954] ${tc.textMuted}`}>{l.label}</a>
              ))}
            </div>
          </div>

          <div className={`mt-6 flex flex-col items-start justify-between gap-2 border-t pt-5 sm:flex-row sm:items-center ${tc.border}`}>
            <p className={`text-[11px] ${tc.textMuted}`}>© {new Date().getFullYear()} Rishab Ramakrishna. All rights reserved.</p>
            <p className={`text-[11px] ${tc.textMuted}`}>Deviate is an AI tool. All output must be reviewed by qualified legal counsel before reliance.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
