import { Link } from '@tanstack/react-router'

export function LegalHeader() {
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-[100] h-[var(--nav-h)] border-b border-border bg-[color-mix(in_oklab,var(--background)_86%,transparent)] backdrop-blur-[12px]">
      <div className="mx-auto max-w-[1400px] px-8 h-full flex items-center">
        <Link to="/" className="text-[length:var(--text-base)] font-semibold tracking-tight flex items-center gap-2">
          <span />
          munkel
        </Link>
      </div>
    </header>
  )
}
