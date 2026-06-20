import type { ReactNode } from 'react'

import { LegalHeader } from './legal-header'
import { SiteFooter } from '@/components/sections/site-footer'

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
