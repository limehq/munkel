import type { ReactNode } from 'react'

import { LegalHeader } from './legal-header'
import { SiteFooter } from '@/components/sections/site-footer'

/**
 * Shared layout wrapper for the legal/content pages (Imprint, Privacy,
 * Contact). Renders the slim LegalHeader, a centered prose column, and the
 * shared SiteFooter so all three pages are pixel-consistent.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <LegalHeader />
      <main className="legal">
        <div className="container legal-container">
          <h1 className="legal-title">{title}</h1>
          {intro ? <p className="legal-lead">{intro}</p> : null}
          <div className="legal-prose">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
