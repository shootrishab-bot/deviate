// Frame-accurate renderer for the Deviate landing-page tour.
//
//   node marketing/render-demo.mjs [baseUrl]
//
// Expects a server already running:
//   npm run build && npx next start -p 3100
//
// Why this exists alongside record-demo.mjs: Chrome's screencast (which backs
// both Playwright's recordVideo and any CDP capture) hands back frames at the
// CSS viewport size and ignores deviceScaleFactor, so real-time capture is
// capped at 1080p. page.screenshot() *does* honour DPR, so this renders one
// screenshot per frame at 2x.
//
// Rendering a frame takes far longer than a frame lasts, so the page's own
// animations cannot be left on the wall clock or they finish between shots.
// Every animation and transition is instead paused as it appears and seeked to
// the exact frame time (Web Animations API). That makes the tour deterministic:
// identical frames every run, with no dropped or duplicated motion.
//
// Env:
//   SCALE=2    device pixel ratio (2 -> 3840x2160)
//   FPS=30     output frame rate
//   QUALITY=92 per-frame JPEG quality
//   SECONDS=   render only the first N seconds (for a quick look)
//
// Output: marketing/deviate-demo-4k.mp4 and marketing/deviate-demo-1080p.mp4

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.argv[2] || 'http://localhost:3100'
const OUT_DIR = path.resolve('marketing')
const FRAME_DIR = path.join(OUT_DIR, '.frames')
const WIDTH = 1920
const HEIGHT = 1080
const SCALE = Number(process.env.SCALE || 2)
const FPS = Number(process.env.FPS || 30)
const QUALITY = Number(process.env.QUALITY || 92)
const LIMIT = process.env.SECONDS ? Number(process.env.SECONDS) : Infinity

const FFMPEG = process.env.FFMPEG ||
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe')

const CLEAN_CSS = `
  html { background: #121212; }
  nextjs-portal { display: none !important; }
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
  html { scrollbar-width: none; }
`

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] })
    child.on('error', reject)
    child.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited ${c}`))))
  })

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// ── The tour, as a timeline ───────────────────────────────────────────────────
// hold   — let the page's own animations play
// scroll — ease the viewport to a target, resolved when the segment starts
// act    — a one-off DOM action on the segment's first frame

const STEP = (i) => `[data-demo-step="${i}"]`

const TIMELINE = [
  { hold: 4.0 },
  { scroll: { sel: 'main section .max-w-5xl', offset: -150 }, dur: 2.0 },
  { hold: 2.2 },
  { scroll: { sel: '#demo', offset: -620 }, dur: 1.4 },
  { hold: 1.7 },
  { scroll: { sel: '#demo', offset: -40 }, dur: 1.6 },
  { hold: 1.9 },
  { act: STEP(0) }, { hold: 2.7 },
  { act: STEP(1) }, { hold: 2.7 },
  { act: STEP(2) }, { hold: 2.5 },
  { act: STEP(3) }, { hold: 2.7 },
  { act: STEP(4) }, { hold: 3.5 },
  { act: STEP(5) }, { hold: 2.7 },
  { act: 'header button[aria-label="Toggle theme"]' }, { hold: 3.4 },
  { act: 'header button[aria-label="Toggle theme"]' }, { hold: 1.4 },
  { scroll: { sel: '#features', offset: -60 }, dur: 1.7 },
  { hold: 2.4 },
  { scroll: { sel: '#risk', offset: -220 }, dur: 1.6 },
  { hold: 2.4 },
  { scroll: { sel: '#playbook', offset: -60 }, dur: 1.7 },
  { hold: 2.9 },
  { scroll: { sel: '#export', offset: -260 }, dur: 1.7 },
  { hold: 2.7 },
  { scroll: { sel: '#faq', offset: -60 }, dur: 1.6 },
  { hold: 1.2 },
  { act: '[data-faq="2"]' }, { hold: 2.2 },
  { scroll: { sel: '#cta', offset: -300 }, dur: 1.7 },
  { hold: 3.2 },
]

async function main() {
  await rm(FRAME_DIR, { recursive: true, force: true })
  await mkdir(FRAME_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
  })
  await context.addInitScript((css) => {
    try { localStorage.setItem('deviate-theme', 'dark') } catch {}
    const style = document.createElement('style')
    style.textContent = css
    ;(document.head || document.documentElement).appendChild(style)
  }, CLEAN_CSS)

  const page = await context.newPage()

  // First pass warms the HTTP cache so the render pass never waits on fonts.
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('h1')
  await page.waitForTimeout(1200)

  // Reload for the take, then take the animation clock away from the page.
  // Anything already running is rebased to zero, so frame one is the true start
  // of the hero entrance.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  await page.evaluate(() => {
    // Animations are paused the moment they appear and advanced by hand, so a
    // frame that takes 300ms of wall time still shows one frame of motion.
    const born = new WeakMap()
    window.__seek = (t) => {
      for (const a of document.getAnimations()) {
        if (!born.has(a)) {
          born.set(a, t)
          try { a.pause() } catch {}
        }
        try { a.currentTime = Math.max(0, (t - born.get(a)) * 1000) } catch {}
      }
    }
    window.__seek(0)
  })

  let frame = 0
  let scrollY = 0
  const t0 = Date.now()

  // Advance every animation to this frame's timestamp.
  const tick = () => page.evaluate((t) => window.__seek(t), frame / FPS)

  const shoot = async () => {
    const buf = await page.screenshot({ type: 'jpeg', quality: QUALITY })
    await writeFile(path.join(FRAME_DIR, `f${String(frame).padStart(6, '0')}.jpg`), buf)
    frame++
    if (frame % 60 === 0) {
      const el = (Date.now() - t0) / 1000
      process.stdout.write(
        `\r  frame ${frame} (${(frame / FPS).toFixed(1)}s of tour, ${el.toFixed(0)}s elapsed)   `
      )
    }
  }

  for (const seg of TIMELINE) {
    if (frame / FPS >= LIMIT) break

    if (seg.act) {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        if (el) el.click()
      }, seg.act)
    }

    if (seg.scroll) {
      const target = await page.evaluate(({ sel, offset }) => {
        const el = document.querySelector(sel)
        if (!el) return window.scrollY
        const max = document.documentElement.scrollHeight - window.innerHeight
        return Math.max(0, Math.min(el.getBoundingClientRect().top + window.scrollY + offset, max))
      }, seg.scroll)
      const from = scrollY
      const n = Math.round(seg.dur * FPS)
      for (let i = 1; i <= n; i++) {
        const y = from + (target - from) * easeInOut(i / n)
        await page.evaluate((v) => window.scrollTo(0, v), y)
        await tick()
        await shoot()
      }
      scrollY = target
      continue
    }

    const n = Math.round((seg.hold ?? 1 / FPS) * FPS)
    for (let i = 0; i < Math.max(n, 1); i++) {
      await tick()
      await shoot()
    }
  }

  process.stdout.write('\n')
  await context.close()
  await browser.close()

  console.log(`Rendered ${frame} frames (${(frame / FPS).toFixed(1)}s at ${FPS}fps)`)

  const master = path.join(OUT_DIR, 'deviate-demo-4k.mp4')
  const hd = path.join(OUT_DIR, 'deviate-demo-1080p.mp4')

  console.log('Encoding 4K master...')
  await run(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(FPS), '-i', path.join(FRAME_DIR, 'f%06d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-an',
    master,
  ])

  console.log('Encoding 1080p...')
  await run(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', master,
    '-vf', 'scale=1920:1080:flags=lanczos',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
    '-movflags', '+faststart', '-an',
    hd,
  ])

  await rm(FRAME_DIR, { recursive: true, force: true })
  console.log(`Wrote ${master} (${WIDTH * SCALE}x${HEIGHT * SCALE}) and ${hd}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
