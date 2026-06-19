import { Link } from '@tanstack/react-router'

/**
 * Slim standalone header for the legal/content pages. Reuses the exact
 * `.wordmark` markup (dot + "munkel") so the brand matches the landing nav
 * 1:1, but links HOME via the TanStack Router <Link> since it renders inside
 * the router tree. It is NOT the bespoke landing <nav> — no hash anchors, no
 * scroll/Motion machinery.
 */
export function LegalHeader() {
  return (
    <header className="legal-header">
      <div className="container legal-header-inner">
        <Link to="/" className="wordmark">
          <span className="dot" />
          munkel
        </Link>
      </div>
    </header>
  )
}
