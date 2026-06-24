'use client'

import { useEffect, useState } from 'react'
import { getPlaybook, savePlaybook } from '../../lib/playbook'

const EMPTY_ENTRY = { clauseType: '', preferredPosition: '', dealbreaker: '', suggestedResponse: '' }

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

function useTheme() {
  const [dark, setDark] = useState(true)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('deviate-theme')
      if (saved === 'light') { setDark(false); document.documentElement.classList.add('light') }
    } catch {}
  }, [])
  const toggle = () => {
    setDark((prev) => {
      const next = !prev
      try {
        localStorage.setItem('deviate-theme', next ? 'dark' : 'light')
        if (next) document.documentElement.classList.remove('light')
        else document.documentElement.classList.add('light')
      } catch {}
      return next
    })
  }
  return { dark, toggle }
}

const tc = {
  bg:        'bg-[var(--bg)]',
  card:      'bg-[var(--bg-card)] border-[var(--border)]',
  cardAlt:   'bg-[var(--bg-card-alt)] border-[var(--border)]',
  input:     'bg-[var(--bg-input)] border-[var(--border)]',
  text:      'text-[var(--text-primary)]',
  textSec:   'text-[var(--text-secondary)]',
  textMuted: 'text-[var(--text-muted)]',
}

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
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      ) : (
        <svg className="h-4 w-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
        </svg>
      )}
    </button>
  )
}

function EntryForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial)
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.clauseType.trim()) return
    onSave(form)
  }

  const inputCls = [
    `w-full rounded-xl border px-4 py-2.5`,
    `text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]`,
    `bg-[var(--bg-card-alt)] border-[var(--border)]`,
    `transition-colors focus:border-[#1DB954] focus:outline-none focus:ring-1 focus:ring-[#1DB954]/40`,
  ].join(' ')

  const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>Clause type *</label>
        <input
          required
          value={form.clauseType}
          onChange={set('clauseType')}
          placeholder="e.g. Indemnity, Governing Law"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Preferred position</label>
        <textarea
          rows={3}
          value={form.preferredPosition}
          onChange={set('preferredPosition')}
          placeholder="Your firm's standard position on this clause"
          className={`${inputCls} resize-none`}
        />
      </div>
      <div>
        <label className={labelCls}>Dealbreaker</label>
        <textarea
          rows={2}
          value={form.dealbreaker}
          onChange={set('dealbreaker')}
          placeholder="Positions that are not acceptable"
          className={`${inputCls} resize-none`}
        />
      </div>
      <div>
        <label className={labelCls}>Suggested response</label>
        <textarea
          rows={3}
          value={form.suggestedResponse}
          onChange={set('suggestedResponse')}
          placeholder="Negotiation language the AI will suggest when this clause deviates"
          className={`${inputCls} resize-none`}
        />
      </div>
      <div className="flex justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className={`rounded-2xl border px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:border-[#333] hover:text-[var(--text-primary)] ${tc.cardAlt} text-[var(--text-secondary)]`}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-2xl bg-gradient-to-r from-[#1DB954] to-[#169C46] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-900/20 transition-all duration-200 hover:shadow-green-900/40 hover:scale-[1.02] active:scale-[0.98]"
        >
          Save entry
        </button>
      </div>
    </form>
  )
}

export default function PlaybookPage() {
  const { dark, toggle: toggleTheme } = useTheme()
  const [entries, setEntries] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setEntries(getPlaybook())
  }, [])

  const persist = (next) => {
    setEntries(next)
    savePlaybook(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleAdd = (form) => {
    persist([...entries, { ...form, id: generateId() }])
    setAdding(false)
  }

  const handleEdit = (form) => {
    persist(entries.map((e) => (e.id === editingId ? { ...form, id: e.id } : e)))
    setEditingId(null)
  }

  const handleDelete = (id) => {
    persist(entries.filter((e) => e.id !== id))
    if (editingId === id) setEditingId(null)
  }

  return (
    <div className={`min-h-screen ${tc.bg} ${tc.text} transition-colors duration-300`}>

      {/* ── Header ── */}
      <header className={`sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-xl`}>
        <div className="mx-auto flex h-[72px] max-w-4xl items-center justify-between px-6">
          <a
            href="/"
            className="flex flex-col items-start gap-0 transition-opacity hover:opacity-80"
          >
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xl tracking-tight text-[#1DB954]">◆</span>
              <span className={`font-extrabold text-xl tracking-tight ${tc.text}`}>deviate</span>
              <span className="rounded-full border border-[#1DB954]/30 bg-[#1DB954]/10 px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#1DB954] tracking-wide">v1</span>
            </div>
            <p className="flicker-tagline text-[10px] font-medium tracking-[0.18em] uppercase text-[var(--text-muted)] pl-6">AI‑Powered Negotiation Risk Analysis</p>
          </a>

          <div className="flex items-center gap-3">
            {saved && (
              <span className="animate-scale-in rounded-full border border-[#1DB954]/20 bg-[#1DB954]/10 px-3 py-1 text-xs font-semibold text-[#1DB954]">
                Saved
              </span>
            )}
            <ThemeToggle dark={dark} onToggle={toggleTheme} />
            <a
              href="/"
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition-all duration-200 hover:bg-white/5 ${tc.textSec}`}
            >
              ← Back to analysis
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-6 py-8">

        {/* Page title */}
        <div className="animate-fade-in-up">
          <h1 className={`text-2xl font-bold ${tc.text}`}>Playbook</h1>
          <p className={`mt-1 text-sm ${tc.textMuted}`}>Clause-level positions and suggested responses used during AI analysis.</p>
        </div>

        {/* Add new entry */}
        {adding ? (
          <div className={`animate-fade-in-up rounded-3xl border border-[#1DB954]/20 p-6 ${tc.card}`}>
            <h2 className={`mb-5 text-base font-bold ${tc.text}`}>New clause entry</h2>
            <EntryForm initial={EMPTY_ENTRY} onSave={handleAdd} onCancel={() => setAdding(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setAdding(true); setEditingId(null) }}
            className={`flex items-center gap-2 rounded-2xl border-2 border-dashed px-5 py-3 text-sm font-semibold transition-all duration-200 hover:border-[#1DB954]/40 hover:text-[#1DB954] hover:bg-[#1DB954]/[0.04] border-[var(--border)] ${tc.textMuted}`}
          >
            <span className="text-base leading-none">+</span>
            Add clause entry
          </button>
        )}

        {/* Empty state */}
        {entries.length === 0 && !adding && (
          <div className={`animate-fade-in-up rounded-3xl border-2 border-dashed p-16 text-center border-[var(--border)]`}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1DB954]/10 glow-green">
              <span className="text-[#1DB954] text-2xl font-extrabold">◆</span>
            </div>
            <p className={`text-sm font-semibold ${tc.textSec}`}>No playbook entries yet</p>
            <p className={`mt-1 text-xs ${tc.textMuted}`}>Add your first clause to get suggested responses during analysis.</p>
          </div>
        )}

        {/* Entry list */}
        <div className="space-y-4">
          {entries.map((entry) =>
            editingId === entry.id ? (
              <div key={entry.id} className={`animate-fade-in-up rounded-3xl border border-[#1DB954]/20 p-6 ${tc.card}`}>
                <h2 className={`mb-5 text-base font-bold ${tc.text}`}>Edit — {entry.clauseType}</h2>
                <EntryForm
                  initial={{
                    clauseType: entry.clauseType,
                    preferredPosition: entry.preferredPosition,
                    dealbreaker: entry.dealbreaker,
                    suggestedResponse: entry.suggestedResponse,
                  }}
                  onSave={handleEdit}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : (
              <div
                key={entry.id}
                className={`animate-fade-in-up rounded-3xl border p-6 transition-all duration-300 hover:border-[#1DB954]/20 hover:shadow-xl hover:shadow-green-900/10 hover:-translate-y-1 ${tc.card}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className={`text-base font-bold ${tc.text}`}>{entry.clauseType}</h3>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditingId(entry.id); setAdding(false) }}
                      className={`rounded-xl border px-4 py-1.5 text-xs font-semibold transition-all duration-200 hover:border-[#1DB954]/30 hover:text-[#1DB954] ${tc.cardAlt} ${tc.textSec}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      className={`rounded-xl border px-4 py-1.5 text-xs font-semibold transition-all duration-200 hover:bg-[#FF4444]/15 hover:border-[#FF4444]/50 hover:text-[#FF4444] border-[#FF4444]/30 bg-[#FF4444]/10 text-[#FF4444]/80`}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  {entry.preferredPosition && (
                    <div>
                      <dt className={`text-[10px] font-semibold uppercase tracking-widest ${tc.textMuted}`}>Preferred position</dt>
                      <dd className={`mt-1.5 text-sm ${tc.textSec}`}>{entry.preferredPosition}</dd>
                    </div>
                  )}
                  {entry.dealbreaker && (
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-widest text-[#FF4444]/60">Dealbreaker</dt>
                      <dd className="mt-1.5 text-sm text-[#FF4444]/80">{entry.dealbreaker}</dd>
                    </div>
                  )}
                  {entry.suggestedResponse && (
                    <div className="sm:col-span-2">
                      <dt className={`text-[10px] font-semibold uppercase tracking-widest ${tc.textMuted}`}>Suggested response</dt>
                      <dd className={`mt-1.5 text-sm ${tc.textSec}`}>{entry.suggestedResponse}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  )
}