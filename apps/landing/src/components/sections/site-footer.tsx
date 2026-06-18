import { CLI_URL, GITHUB_URL, LICENSE_URL, PROTOCOL_URL } from '@/lib/constants'

export function SiteFooter() {
  return (
    <footer>
      <div className="container footer-inner">
        <span className="muted">munkel · ephemeral messages between friends.</span>
        <div className="footer-links">
          <a href={GITHUB_URL}>GitHub</a>
          <a href={PROTOCOL_URL}>Protocol v1</a>
          <a href={CLI_URL}>munkel CLI</a>
          <a href={LICENSE_URL}>MIT License</a>
        </div>
      </div>
    </footer>
  )
}
