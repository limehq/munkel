import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { motion, useMotionValueEvent, useScroll } from 'motion/react'
import { usePostHog } from '@posthog/react'

import { Button } from '@/components/ui/button'
import { DownloadButton } from '@/components/download-button'
import { GithubIcon, MeerkatGlyph } from '@/components/icons'
import { GITHUB_URL } from '@/lib/constants'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  ['#how', 'How it works'],
  ['#features', 'Features'],
  ['#pricing', 'Pricing'],
  ['#faq', 'FAQ'],
] as const

export function Nav() {
  const posthog = usePostHog()
  const [floating, setFloating] = useState(false)
  const [active, setActive] = useState<string | null>(null)

  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, 'change', (y) => {
    if (y > 72) setFloating(true)
    else if (y < 16) setFloating(false)
  })

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
    }
  }

  return (
    <nav
      className={cn(
        'sticky [top:env(safe-area-inset-top,0px)] z-[100] h-[var(--nav-h)] border-b border-border bg-[color-mix(in_oklab,var(--background)_86%,transparent)] backdrop-blur-[12px] [transition:background_0.3s_ease,border-color_0.3s_ease,backdrop-filter_0.3s_ease]',
        floating && 'border-b-transparent bg-transparent backdrop-blur-none',
      )}
    >
      <div
        className={cn(
          'mx-auto flex h-full w-full max-w-[1100px] items-center justify-between gap-5 rounded-full border border-transparent px-8 [transition:width_0.4s_cubic-bezier(0.4,0,0.2,1),max-width_0.4s_cubic-bezier(0.4,0,0.2,1),transform_0.4s_cubic-bezier(0.4,0,0.2,1),padding_0.4s_cubic-bezier(0.4,0,0.2,1),border-color_0.35s_ease,background_0.35s_ease,box-shadow_0.35s_ease]',
          floating &&
            'w-[calc(100%-2rem)] max-w-[1040px] [transform:translateY(12px)] border-border bg-[color-mix(in_oklab,var(--background)_82%,transparent)] pr-4 pl-6 backdrop-blur-[12px] shadow-[var(--shadow-md)]',
        )}
      >
        <div className="flex items-center gap-7 min-w-0">
          <a
            href="/"
            className="flex items-center gap-2 text-[length:var(--text-base)] font-semibold tracking-[var(--tracking-tight)]"
          >
            <MeerkatGlyph className="h-[1.5em] w-[1.5em] text-brand [filter:drop-shadow(0_0_calc(var(--glow)*10px)_var(--brand-soft))]" />munkel
          </a>
          <div className="relative flex items-center gap-1 max-[1080px]:hidden">
            {NAV_LINKS.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className={cn(
                  'relative z-[1] rounded-full px-3 py-1.5 text-[length:var(--text-sm)] whitespace-nowrap text-muted-foreground transition-[color] duration-200 hover:text-foreground',
                  active === href && 'text-primary-foreground',
                )}
                onClick={() => {
                  setActive(href)
                  posthog?.capture('nav_link_clicked', { label })
                }}
              >
                {active === href && (
                  <motion.span
                    layoutId="navPill"
                    className="absolute inset-0 z-[-1] bg-primary rounded-full"
                    transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                  />
                )}
                {label}
              </a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DownloadButton location="nav" variant="nav" size="nav" className="max-[480px]:p-[0.375rem] max-[480px]:[&_span]:hidden" aria-label="Download">
            <span>Download</span>
          </DownloadButton>
          <Button asChild variant="ghost" size="icon">
            <a
              href={GITHUB_URL}
              aria-label="GitHub"
              title="GitHub"
              onClick={() => posthog?.capture('cta_github_clicked', { location: 'nav' })}
            >
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
