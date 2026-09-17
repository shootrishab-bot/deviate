/** @type {import('next').NextConfig} */

// Next needs inline scripts and styles to hydrate, so script-src/style-src
// carry 'unsafe-inline'. The rest of the policy is still worth having: it stops
// the app being framed, blocks plugin content, and pins where scripts, styles
// and connections may come from.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

// The review tool and the playbook hold client matter data. The marketing page
// at / is deliberately left indexable.
const privateHeaders = [
  ...securityHeaders,
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
]

const nextConfig = {
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/app/:path*', headers: privateHeaders },
      { source: '/app', headers: privateHeaders },
      { source: '/playbook/:path*', headers: privateHeaders },
      { source: '/playbook', headers: privateHeaders },
      { source: '/api/:path*', headers: privateHeaders },
    ]
  },
}

module.exports = nextConfig
