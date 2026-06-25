import { Link } from '@tanstack/react-router'
import { usePostHog } from '@posthog/react'

import { MeerkatGlyph } from '@/components/icons'
import { CLI_URL, GITHUB_URL, LICENSE_URL, PROTOCOL_URL } from '@/lib/constants'

export function SiteFooter() {
  const posthog = usePostHog()
  return (
    <footer>
      <div className="container footer-inner">
        <span className="muted footer-brand">
          <MeerkatGlyph />munkel · the note you'd say across a table.
        </span>
        <div
          className="footer-links"
          onClick={(e) => {
            const link = (e.target as HTMLElement).closest('a')
            if (link)
              posthog?.capture('footer_link_clicked', {
                label: link.textContent?.trim(),
                href: link.getAttribute('href'),
              })
          }}
        >
          <Link to="/imprint">Imprint</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/contact">Contact</Link>
          <a href={GITHUB_URL}>GitHub</a>
          <a href={PROTOCOL_URL}>Protocol v1</a>
          <a href={CLI_URL}>munkel CLI</a>
          <a href={LICENSE_URL}>MIT License</a>
        </div>
      </div>
    </footer>
  )
}
