// Records a scripted marketing tour of the Deviate landing page.
//
//   node marketing/record-demo.mjs [baseUrl]
//
// Expects a server already running. A production build gives the cleanest
// capture (no dev overlay, no HMR jank):
//
//   npm run build && npx next start -p 3100
//
// Frames are captured over CDP at SCALE x device pixel ratio and encoded with
// ffmpeg. Playwright's own recordVideo is deliberately not used: it captures at
// the CSS viewport size regardless of deviceScaleFactor, which caps you at 1080p.
//
// Env:
//   SCALE=2     device pixel ratio (2 -> a 3840x2160 master)
//   QUALITY=88  screencast JPEG quality
//   FPS=30      output frame rate
//   SLOWMO=1    stretch the whole tour clock, then speed the footage back up
//   GLIDE=1.6   scroll-move duration multiplier. Chrome delivers only ~13
//               screencast fps at 4K, so scrolls are run slower: fewer pixels
//               change per captured frame, which removes judder (and reads as
//               more deliberate camera work).
//   TOUR=short  abbreviated tour, for checking capture throughput
//
// Output: marketing/deviate-demo.mp4 (master) and marketing/deviate-demo-1080p.mp4

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.argv[2] || 'http://localhost:3100'
const OUT_DIR = path.resolve('marketing')
const FRAME_DIR = path.join(OUT_DIR, '.frames')
const WIDTH = 1920
const HEIGHT = 1080
const SCALE = Number(process.env.SCALE || 2)
const QUALITY = Number(process.env.QUALITY || 88)
const FPS = Number(process.env.FPS || 30)
const SLOWMO = Number(process.env.SLOWMO || 1)
const GLIDE = Number(process.env.GLIDE || 1.6)
const SHORT = process.env.TOUR === 'short'

const FFMPEG = process.env.FFMPEG ||
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe')

// Hide anything that would read as "running on a laptop" rather than "a
// product", and paint the page background before first paint so the opening
// frames never flash white.
const CLEAN_CSS = `
  html { background: #121212; }
  nextjs-portal { display: none !important; }
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
  html { scrollbar-width: none; }
`

const wait = (ms) => new Promise((r) => setTimeout(r, ms * SLOWMO))

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited ${code}`))))
  })

/** Cinematic tween scroll — the browser's native smooth scroll is too abrupt on video. */
async function glide(page, locator, { offset = -90, duration = 1700 } = {}) {
  duration *= SLOWMO * GLIDE
  const box = await locator.boundingBox()
  if (!box) return
  const target = await page.evaluate((y) => window.scrollY + y, box.y + offset)
  await page.evaluate(
    ({ target, duration }) =>
      new Promise((resolve) => {
        const start = window.scrollY
        const max = document.documentElement.scrollHeight - window.innerHeight
        const end = Math.max(0, Math.min(target, max))
        const t0 = performance.now()
        const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
        const step = (now) => {
          const p = Math.min((now - t0) / duration, 1)
          window.scrollTo(0, start + (end - start) * ease(p))
          if (p < 1) requestAnimationFrame(step)
          else resolve()
        }
        requestAnimationFrame(step)
      }),
    { target, duration }
  )
  await wait(150)
}

async function tour(page) {
  const themeToggle = page.locator('header button[aria-label="Toggle theme"]')

  // ── Hero: the choreographed entrance is the opening shot ──────────────────
  await wait(4000)

  // ── Hero screenshot ───────────────────────────────────────────────────────
  const heroShot = page.locator('main section').first().locator('.max-w-5xl').first()
  await glide(page, heroShot, { offset: -150, duration: 2000 })
  await wait(2200)

  // ── Stat strip ────────────────────────────────────────────────────────────
  await glide(page, page.getByText('Under 60s'), { offset: -340, duration: 1400 })
  await wait(1700)

  // ── Walkthrough, step by step ─────────────────────────────────────────────
  await glide(page, page.locator('#demo'), { offset: -40, duration: 1600 })
  await wait(1900)

  const stepButtons = page.locator('#demo div.lg\\:block button')
  const holds = SHORT ? [2000, 2000] : [2700, 2700, 2500, 2700, 3500, 2700]
  for (let i = 0; i < holds.length; i++) {
    await stepButtons.nth(i).click()
    await wait(holds[i])
  }
  if (SHORT) return

  // ── Light mode: the screenshots are theme-aware, so the whole shot flips ──
  await themeToggle.click()
  await wait(3400)
  await themeToggle.click()
  await wait(1400)

  // ── Capabilities ──────────────────────────────────────────────────────────
  await glide(page, page.locator('#features'), { offset: -60, duration: 1700 })
  await wait(2400)

  // ── Risk model ────────────────────────────────────────────────────────────
  await glide(page, page.getByRole('heading', { name: /Three ratings/ }), { offset: -220, duration: 1600 })
  await wait(2400)

  // ── Playbook ──────────────────────────────────────────────────────────────
  await glide(page, page.locator('#playbook'), { offset: -60, duration: 1700 })
  await wait(2900)

  // ── Export ────────────────────────────────────────────────────────────────
  await glide(page, page.getByRole('heading', { name: /Walk out with a report/ }), { offset: -260, duration: 1700 })
  await wait(2700)

  // ── FAQ ───────────────────────────────────────────────────────────────────
  await glide(page, page.locator('#faq'), { offset: -60, duration: 1600 })
  await wait(1200)
  await page.locator('#faq button').nth(2).click()
  await wait(2200)

  // ── Closing CTA ───────────────────────────────────────────────────────────
  await glide(page, page.getByRole('heading', { name: /Ready to spot what they changed/ }), { offset: -300, duration: 1700 })
  await wait(3200)
}

async function main() {
  await rm(FRAME_DIR, { recursive: true, force: true })
  await mkdir(FRAME_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
  })

  // Applied before any page script, so the hero entrance plays on camera
  // rather than behind a style injection.
  await context.addInitScript((css) => {
    try { localStorage.setItem('deviate-theme', 'dark') } catch {}
    const style = document.createElement('style')
    style.textContent = css
    ;(document.head || document.documentElement).appendChild(style)
  }, CLEAN_CSS)

  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'load' })
  await page.waitForSelector('h1')

  // ── Capture ───────────────────────────────────────────────────────────────
  const client = await context.newCDPSession(page)

  const frames = []
  const writes = []
  let n = 0

  client.on('Page.screencastFrame', (frame) => {
    // Ack first so Chrome keeps sending; persist the bytes behind it.
    client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})
    const file = `f${String(n++).padStart(6, '0')}.jpg`
    frames.push({ file, ts: frame.metadata.timestamp })
    writes.push(writeFile(path.join(FRAME_DIR, file), Buffer.from(frame.data, 'base64')))
  })

  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: QUALITY,
    maxWidth: WIDTH * SCALE,
    maxHeight: HEIGHT * SCALE,
    everyNthFrame: 1,
  })

  const t0 = Date.now()
  await tour(page)
  const wall = (Date.now() - t0) / 1000

  await client.send('Page.stopScreencast').catch(() => {})
  await wait(400)
  await Promise.all(writes)
  await context.close()
  await browser.close()

  if (frames.length < 2) throw new Error('No frames captured.')
  const span = frames[frames.length - 1].ts - frames[0].ts
  const captured = frames.length / span
  console.log(
    `Captured ${frames.length} frames over ${span.toFixed(1)}s at ${captured.toFixed(1)} fps ` +
    `(${wall.toFixed(1)}s wall) -> ${(captured * SLOWMO).toFixed(1)} fps of motion after speed-up`
  )

  // ── Assemble ──────────────────────────────────────────────────────────────
  // Real inter-frame gaps are preserved, then resampled to a constant rate.
  const lines = []
  for (let i = 0; i < frames.length; i++) {
    const dur = i < frames.length - 1
      ? Math.max(0.001, frames[i + 1].ts - frames[i].ts)
      : 1 / FPS
    lines.push(`file '${frames[i].file}'`, `duration ${dur.toFixed(4)}`)
  }
  lines.push(`file '${frames[frames.length - 1].file}'`)
  await writeFile(path.join(FRAME_DIR, 'list.txt'), lines.join('\n'))

  const master = path.join(OUT_DIR, 'deviate-demo.mp4')
  const hd = path.join(OUT_DIR, 'deviate-demo-1080p.mp4')

  console.log('Encoding master...')
  await run(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', path.join(FRAME_DIR, 'list.txt'),
    '-vf', SLOWMO === 1 ? `fps=${FPS}` : `setpts=PTS/${SLOWMO},fps=${FPS}`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
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
