import { Link } from '@tanstack/react-router'

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
