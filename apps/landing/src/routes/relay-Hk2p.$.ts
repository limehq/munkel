import { createFileRoute } from '@tanstack/react-router'

const PREFIX = '/relay-Hk2p'
const ASSET_HOST = 'eu-assets.i.posthog.com'
const INGEST_HOST = 'eu.i.posthog.com'
const MAX_BODY_BYTES = 1_000_000

async function forward(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.slice(PREFIX.length)
  const host = path.startsWith('/static/') || path.startsWith('/array/') ? ASSET_HOST : INGEST_HOST

  const headers = new Headers(request.headers)
  headers.set('host', host)
  headers.delete('cookie')
  const clientIp = request.headers.get('CF-Connecting-IP')
  if (clientIp) headers.set('X-Forwarded-For', clientIp)

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  if (hasBody && Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    return new Response('Payload too large', { status: 413 })
  }
  return fetch(`https://${host}${path}${url.search}`, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
  })
}

export const Route = createFileRoute('/relay-Hk2p/$')({
  server: {
    handlers: {
      GET: ({ request }) => forward(request),
      POST: ({ request }) => forward(request),
      OPTIONS: ({ request }) => forward(request),
    },
  },
})
