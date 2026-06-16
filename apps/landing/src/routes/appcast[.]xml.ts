import { createFileRoute, redirect } from '@tanstack/react-router'

// Sparkle reads Munkel's appcast from a stable URL on our own domain
// (SUFeedURL = https://munkel.app/appcast.xml). Sparkle (and curl) GET it
// directly; SSR runs beforeLoad and the thrown redirect becomes a real HTTP 302
// to the latest GitHub release's EdDSA-signed appcast asset (built in
// release.yml). Sparkle follows the redirect. Owning the URL means the backing
// store can later change (e.g. an R2-backed accumulating feed) without
// reshipping the SUFeedURL baked into already-installed builds.
const APPCAST_TARGET =
  'https://github.com/limehq/munkel/releases/latest/download/appcast.xml'

export const Route = createFileRoute('/appcast.xml')({
  beforeLoad: () => {
    throw redirect({ href: APPCAST_TARGET, statusCode: 302 })
  },
})
