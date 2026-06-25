// The Munkel mascot — the same single-path meerkat glyph the macOS app ships
// (public/munkel-glyph.svg). Rendered as a CSS mask so it inherits `currentColor`
// and themes for free; sizing comes from the consumer's class.
export function MeerkatGlyph({ className = '' }: { className?: string }) {
  return <span className={`inline-block flex-none bg-current [-webkit-mask:url(/munkel-glyph.svg)_center_/_contain_no-repeat] [mask:url(/munkel-glyph.svg)_center_/_contain_no-repeat] ${className}`.trim()} aria-hidden />
}

// GitHub's mark isn't in lucide, so it's hand-rolled to match the lucide stroke
// look (the global `svg.lucide` rule handles sizing + stroke-width).
export function GithubIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`lucide ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path>
      <path d="M9 18c-4.51 2-5-2-7-2"></path>
    </svg>
  )
}
