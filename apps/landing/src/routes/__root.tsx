import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { PostHogProvider } from '@posthog/react'
import { useEffect, useState, type ReactNode } from 'react'

import appCss from '../styles.css?url'
import geistLatinWoff2 from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'
import geistMonoLatinWoff2 from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url'

const SITE_URL = 'https://munkel.app'
const TITLE = 'Munkel · ephemeral messages from the notch'
const DESCRIPTION =
  'Quick pings between friends, end-to-end encrypted — they slide out of the MacBook notch, linger a moment, and vanish. Nothing is ever stored.'
const OG_IMAGE = `${SITE_URL}/og.png`

// Restore the stored theme before first paint to avoid a light-mode flash.
// Dark is the default; only an explicit 'light' choice removes the class.
const THEME_SCRIPT = `try{if(localStorage.getItem('munkel-theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      { name: 'theme-color', content: '#1e140d' },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: SITE_URL },
      { property: 'og:site_name', content: 'Munkel' },
      { property: 'og:image', content: OG_IMAGE },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'A message sliding out of the MacBook notch' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: TITLE },
      { name: 'twitter:description', content: DESCRIPTION },
      { name: 'twitter:image', content: OG_IMAGE },
    ],
    links: [
      {
        rel: 'preload',
        href: geistLatinWoff2,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: geistMonoLatinWoff2,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'canonical', href: SITE_URL },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <div className="not-found">
      <div className="app-icon">
        <img src="/app-icon.png" alt="The Munkel meerkat" width={112} height={112} />
      </div>
      <h1>404</h1>
      <p>This one already vanished — like every good munkel. Nothing here is ever stored.</p>
      <a className="nf-home" href="/">← Back to munkel.app</a>
    </div>
  )
}

function analyticsOptedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
  if (nav.globalPrivacyControl) return true
  const dnt = nav.doNotTrack ?? nav.msDoNotTrack ?? (window as Window & { doNotTrack?: string }).doNotTrack
  return dnt === '1' || dnt === 'yes'
}

function RootDocument({ children }: { children: ReactNode }) {
  const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined
  const [analyticsOn, setAnalyticsOn] = useState(false)
  useEffect(() => {
    if (posthogKey && !analyticsOptedOut()) setAnalyticsOn(true)
  }, [posthogKey])
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {analyticsOn && posthogKey ? (
          <PostHogProvider
            apiKey={posthogKey}
            options={{
              api_host: '/relay-Hk2p',
              ui_host: 'https://eu.posthog.com',
              defaults: '2026-01-30',
              person_profiles: 'identified_only',
              cookieless_mode: 'always',
              disable_session_recording: true,
              autocapture: false,
              capture_performance: false,
              respect_dnt: true,
            }}
          >
            {children}
          </PostHogProvider>
        ) : (
          children
        )}
        {/* Stripped from production builds by @tanstack/devtools-vite — do not
            wrap in a manual DEV gate; its AST transform chokes on that. */}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
