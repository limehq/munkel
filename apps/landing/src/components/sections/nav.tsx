import { useEffect, useState } from 'react'
import { Download, Moon, Sun } from 'lucide-react'
import { motion, useMotionValueEvent, useScroll } from 'motion/react'

import { Button } from '@/components/ui/button'
import { GithubIcon, MeerkatGlyph } from '@/components/icons'
import { DOWNLOAD_URL, GITHUB_URL } from '@/lib/constants'

const NAV_LINKS = [
  ['#how', 'How it works'],
  ['#features', 'Features'],
  ['#cli', 'CLI'],
  ['#agents', 'Agents'],
  ['#privacy', 'Privacy'],
  ['#faq', 'FAQ'],
] as const

/** Nav: floating bar (scroll hysteresis) + sliding active pill (Motion layoutId). */
export function Nav() {
  const [floating, setFloating] = useState(false)
  const [active, setActive] = useState<string | null>(null)

  // Hysteresis: enter floating well below the top, leave only near the very top —
  // so the bar never flip-flops around a single threshold.
  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, 'change', (y) => {
    if (y > 72) setFloating(true)
    else if (y < 16) setFloating(false)
  })

  // Land on the matching pill if the page opens at a section hash.
  useEffect(() => {
    if (location.hash && NAV_LINKS.some(([href]) => href === location.hash)) {
      const hash = location.hash
      requestAnimationFrame(() => setActive(hash))
    }
  }, [])

  const toggleTheme = () => {
    const dark = document.documentElement.classList.toggle('dark')
    try {
      localStorage.setItem('munkel-theme', dark ? 'dark' : 'light')
    } catch {
      // private mode etc. — theme just won't persist
    }
  }

  return (
    <nav className={floating ? 'floating' : undefined}>
      <div className="nav-inner">
        <div className="nav-left">
          <a href="/" className="wordmark">
            <MeerkatGlyph className="meerkat-mark" />munkel
          </a>
          <div className="nav-links">
            {NAV_LINKS.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className={active === href ? 'active' : undefined}
                onClick={() => setActive(href)}
              >
                {active === href && (
                  <motion.span
                    layoutId="navPill"
                    className="nav-active-pill"
                    transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                  />
                )}
                {label}
              </a>
            ))}
          </div>
        </div>
        <div className="nav-actions">
          <Button asChild variant="nav" size="nav" className="nav-cta">
            <a href={DOWNLOAD_URL} aria-label="Download">
              <Download aria-hidden />
              <span>Download</span>
            </a>
          </Button>
          <Button asChild variant="ghost" size="icon">
            <a href={GITHUB_URL} aria-label="GitHub" title="GitHub">
              <GithubIcon />
            </a>
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            <Moon className="hidden dark:block" aria-hidden />
            <Sun className="block dark:hidden" aria-hidden />
          </Button>
        </div>
      </div>
    </nav>
  )
}
