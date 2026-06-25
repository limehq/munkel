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
          <div className="max-w-[70ch] mt-10 text-[length:var(--text-base)] text-foreground leading-relaxed text-pretty [&>*+*]:mt-5 [&>:first-child]:mt-0 [&_h2]:mt-12 [&_h2]:text-[length:var(--text-2xl)] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:leading-snug [&_h2]:text-balance [&_h3]:mt-8 [&_h3]:text-[length:var(--text-lg)] [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:leading-snug [&_p]:text-foreground [&_ul]:pl-5 [&_ul]:list-disc [&_li]:mt-2 [&_li::marker]:text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-[3px] [&_a]:decoration-[var(--border)] [&_a]:[transition:text-decoration-color_0.2s_ease] [&_a:hover]:decoration-[var(--foreground)]">
            {children}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
