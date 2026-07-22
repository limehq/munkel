import { Link } from '@tanstack/react-router'
import { usePostHog } from '@posthog/react'

import { MeerkatGlyph } from '@/components/icons'
import { CLI_URL, GITHUB_URL, LICENSE_URL, PROTOCOL_URL } from '@/lib/constants'

export function SiteFooter() {
  const posthog = usePostHog()
  return (
    <footer className="border-t border-border pt-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
      <div className="mx-auto max-w-[1400px] px-8 flex items-center justify-between gap-4 flex-wrap">
        <span className="text-muted-foreground inline-flex items-center gap-[0.45rem] text-[length:var(--text-xs)]!">
          <MeerkatGlyph className="w-[1.05rem] h-[1.05rem] text-brand" />munkel · the note you'd say across a table.
        </span>
        <div
          className="flex gap-6 max-[600px]:flex-wrap max-[600px]:gap-y-1 max-[600px]:gap-x-5"
          onClick={(e) => {
            const link = (e.target as HTMLElement).closest('a')
            if (link)
              posthog?.capture('footer_link_clicked', {
                label: link.textContent?.trim(),
                href: link.getAttribute('href'),
              })
          }}
        >
          <Link to="/imprint" className="text-[length:var(--text-xs)] text-muted-foreground hover:text-foreground max-[600px]:py-[0.4rem] max-[600px]:text-[length:var(--text-sm)] max-[600px]:whitespace-nowrap">Imprint</Link>
          <Link to="/privacy" className="text-[length:var(--text-xs)] text-muted-foreground hover:text-foreground max-[600px]:py-[0.4rem] max-[600px]:text-[length:var(--text-sm)] max-[600px]:whitespace-nowrap">Privacy</Link>
          <Link to="/contact" className="text-[length:var(--text-xs)] text-muted-foreground hover:text-foreground max-[600px]:py-[0.4rem] max-[600px]:text-[length:var(--text-sm)] max-[600px]:whitespace-nowrap">Contact</Link>
          <a href={GITHUB_URL} className="text-[length:var(--text-xs)] text-muted-foreground hover:text-foreground max-[600px]:py-[0.4rem] max-[600px]:text-[length:var(--text-sm)] max-[600px]:whitespace-nowrap">GitHub</a>
          <a href={PROTOCOL_URL} className="text-[length:var(--text-xs)] text-muted-foreground hover:text-foreground max-[600px]:py-[0.4rem] max-[600px]:text-[length:var(--text-sm)] max-[600px]:whitespace-nowrap">Protocol v1</a>
          <a href={CLI_URL} className="text-[length:var(--text-xs)] text-muted-foreground hover:text-foreground max-[600px]:py-[0.4rem] max-[600px]:text-[length:var(--text-sm)] max-[600px]:whitespace-nowrap">munkel CLI</a>
          <a href={LICENSE_URL} className="text-[length:var(--text-xs)] text-muted-foreground hover:text-foreground max-[600px]:py-[0.4rem] max-[600px]:text-[length:var(--text-sm)] max-[600px]:whitespace-nowrap">MIT License</a>
        </div>
      </div>
    </footer>
  )
}
