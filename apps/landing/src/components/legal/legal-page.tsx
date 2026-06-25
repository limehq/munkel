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
      <main className="pt-20 pb-28 border-t border-border max-[600px]:pt-14 max-[600px]:pb-20">
        <div className="mx-auto max-w-[1100px] px-8">
          <h1 className="text-[length:var(--text-4xl)]! font-bold! tracking-tight! leading-tight! text-balance! max-w-[70ch]! mx-0!">{title}</h1>
          {intro ? <p className="mt-[1.125rem] text-[length:var(--text-lg)] text-muted-foreground leading-relaxed text-pretty max-w-[70ch]">{intro}</p> : null}
          <div className="legal-prose">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
