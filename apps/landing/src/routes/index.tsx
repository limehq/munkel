import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  Download,
  Info,
  Laptop,
  Lock,
  MonitorOff,
  Moon,
  Package,
  Sun,
  Terminal,
  TimerOff,
  UserRoundX,
  Wifi,
} from 'lucide-react'

export const Route = createFileRoute('/')({ component: LandingPage })

const GITHUB_URL = 'https://github.com/limehq/munkel'
const DOWNLOAD_URL = '#'

function GithubIcon({ className = '' }: { className?: string }) {
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

/* ---------- Nav: floating bar + sliding active pill ---------- */

const NAV_LINKS = [
  ['#how', 'How it works'],
  ['#features', 'Features'],
  ['#cli', 'CLI'],
  ['#agents', 'Agents'],
  ['#privacy', 'Privacy'],
] as const

type PillRect = { left: number; top: number; width: number; height: number }

function Nav() {
  const [floating, setFloating] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [pill, setPill] = useState<PillRect | null>(null)
  const linksRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<string | null>(null)

  // Hysteresis: enter floating well below the top, leave only near the
  // very top — so the bar never flip-flops around a single threshold.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      if (y > 72) setFloating(true)
      else if (y < 16) setFloating(false)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const moveTo = (href: string) => {
    const wrap = linksRef.current
    if (!wrap) return
    const a = wrap.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)
    if (!a) return
    activeRef.current = href
    setActive(href)
    setPill({ left: a.offsetLeft, top: a.offsetTop, width: a.offsetWidth, height: a.offsetHeight })
  }

  useEffect(() => {
    const onResize = () => {
      if (activeRef.current) moveTo(activeRef.current)
    }
    window.addEventListener('resize', onResize)
    if (location.hash && NAV_LINKS.some(([href]) => href === location.hash)) {
      const hash = location.hash
      requestAnimationFrame(() => moveTo(hash))
    }
    return () => window.removeEventListener('resize', onResize)
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
          <a href="#" className="wordmark">
            <span className="dot"></span>munkel
          </a>
          <div className="nav-links" ref={linksRef}>
            <span
              className="nav-active-pill"
              style={pill ? { ...pill, opacity: 1 } : undefined}
            />
            {NAV_LINKS.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className={active === href ? 'active' : undefined}
                onClick={() => moveTo(href)}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
        <div className="nav-actions">
          <a className="icon-btn" href={GITHUB_URL} aria-label="GitHub" title="GitHub">
            <GithubIcon />
          </a>
          <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
            <Moon className="moon" aria-hidden />
            <Sun className="sun" aria-hidden />
          </button>
        </div>
      </div>
    </nav>
  )
}

/* ---------- Hero: pinned scroll stage + notch whisper demo ---------- */

const MESSAGES = [
  { name: 'Anna', avatar: '/avatars/01.png', text: 'Kaffee, jemand?' },
  { name: 'Ben', avatar: '/avatars/02.png', text: 'on my way' },
  { name: 'Jurij', avatar: '/avatars/03.png', text: 'deploy is live, go look' },
  { name: 'Mia', avatar: '/avatars/05.png', text: 'same table as last time' },
]

type NotchCtl = {
  enabled: boolean
  dwell: number
  docked: boolean
  openTeaser?: () => void
  closeTeaser?: () => void
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function Hero() {
  const stageRef = useRef<HTMLDivElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const macRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)
  const notchRef = useRef<HTMLDivElement>(null)
  const msgRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLImageElement>(null)
  const notchCtl = useRef<NotchCtl>({ enabled: true, dwell: 3400, docked: false })
  const [clock, setClock] = useState('Thu 9:41')
  const [msgCopied, setMsgCopied] = useState(false)

  useEffect(() => {
    const now = new Date()
    setClock(
      now.toLocaleDateString('en-US', { weekday: 'short' }) +
        ' ' +
        now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }),
    )
  }, [])

  // Notch demo: opened by the scroll director the moment the MacBook
  // docks. Once open, it stays open; messages rotate in place until
  // closeTeaser(). The session token guarantees only ONE rotation loop
  // is ever alive — a stale loop sleeping through a close/reopen cycle
  // sees a newer session and exits.
  useEffect(() => {
    const root = notchRef.current
    const elMsg = msgRef.current
    const elAvatar = avatarRef.current
    if (!root || !elMsg || !elAvatar) return

    let hovered = false
    let open = false
    let session = 0
    let i = 0

    const onEnter = () => {
      hovered = true
    }
    const onLeave = () => {
      hovered = false
    }
    root.addEventListener('mouseenter', onEnter)
    root.addEventListener('mouseleave', onLeave)

    const ctl = notchCtl.current
    ctl.openTeaser = async () => {
      if (open) return
      open = true
      const s = ++session
      const live = () => open && s === session
      const m = MESSAGES[i % MESSAGES.length]
      i++
      elMsg.textContent = m.text
      elAvatar.src = m.avatar
      root.classList.add('teaser')
      // Robustness: if the CSS transition is throttled/frozen (background
      // tab, energy saver), snap to the final teaser state inline.
      await sleep(600)
      if (!live()) return
      if (parseFloat(getComputedStyle(root).width) < 200) {
        const small = window.matchMedia('(max-width: 900px)').matches
        root.style.transition = 'none'
        root.style.width = small ? '220px' : '260px'
        root.style.height = small ? '44px' : '56px'
        root.style.borderRadius = '0 0 18px 18px'
        root.querySelectorAll<HTMLElement>('.mbn-avatar, .mbn-copy, .mbn-body').forEach((e) => {
          e.style.transition = 'none'
          e.style.opacity = '1'
        })
      }
      while (live()) {
        await sleep(ctl.dwell)
        while (hovered && live()) {
          await sleep(300)
        }
        if (!live()) break
        const n = MESSAGES[i % MESSAGES.length]
        i++
        elMsg.style.transition = 'opacity 0.18s ease'
        elAvatar.style.transition = 'opacity 0.18s ease'
        elMsg.style.opacity = '0'
        elAvatar.style.opacity = '0'
        await sleep(200)
        if (!live()) return
        elMsg.textContent = n.text
        elAvatar.src = n.avatar
        elMsg.style.opacity = '1'
        elAvatar.style.opacity = '1'
        await sleep(220)
        if (!live()) return
        elMsg.style.transition = ''
        elAvatar.style.transition = ''
        elMsg.style.opacity = ''
        elAvatar.style.opacity = ''
      }
    }
    // Called by the scroll director when the user scrolls back above the
    // dock point (the director handles the visual retract itself).
    ctl.closeTeaser = () => {
      open = false
      session++
      elMsg.style.transition = ''
      elAvatar.style.transition = ''
      elMsg.style.opacity = ''
      elAvatar.style.opacity = ''
    }

    return () => {
      open = false
      session++
      ctl.openTeaser = undefined
      ctl.closeTeaser = undefined
      root.removeEventListener('mouseenter', onEnter)
      root.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // Scroll director — one scrubbed timeline: copy recedes → MacBook takes
  // center stage → zoom toward the notch → demo starts.
  useEffect(() => {
    const stage = stageRef.current
    const copy = copyRef.current
    const wrap = wrapRef.current
    const mac = macRef.current
    const screen = screenRef.current
    const hint = hintRef.current
    const mbn = notchRef.current
    if (!stage || !copy || !wrap || !mac || !screen || !mbn) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctl = notchCtl.current
    const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

    let ticking = false
    function update() {
      ticking = false
      const vh = window.innerHeight
      const total = Math.max(1, stage!.offsetHeight - vh)
      const p = clamp01(-stage!.getBoundingClientRect().top / total)

      // 1 — hero copy recedes and fades out
      const pc = ease(clamp01(p / 0.38))
      copy!.style.opacity = (1 - pc).toFixed(3)
      copy!.style.transform =
        'translateY(' + (-64 * pc).toFixed(1) + 'px) scale(' + (1 - 0.05 * pc).toFixed(4) + ')'
      copy!.style.pointerEvents = pc > 0.5 ? 'none' : ''
      if (hint) hint.style.opacity = Math.max(0, 1 - p / 0.06).toFixed(3)

      // 2 — the MacBook takes the stage: rises to center, flattens, grows
      const pm = ease(clamp01((p - 0.04) / 0.6))
      const targetTop = (vh - wrap!.offsetHeight) / 2
      const ty = (targetTop - wrap!.offsetTop) * pm
      const sc = 0.94 + 0.2 * pm
      wrap!.style.transform = 'translateY(' + ty.toFixed(1) + 'px) scale(' + sc.toFixed(4) + ')'
      // 3 — keep scrolling: zoom in, docked to the MacBook's top edge
      // (transform-origin 50% 0%, so the notch edge stays pinned)
      const pz = ease(clamp01((p - 0.62) / 0.38))
      mac!.style.transform =
        'rotateX(' + (22 * (1 - pm)).toFixed(2) + 'deg) scale(' + (1 + 0.45 * pz).toFixed(4) + ')'
      mac!.style.opacity = (0.55 + 0.45 * pm).toFixed(3)
      // The 1px rim hairline aliases in/out under non-integer scale —
      // kill it completely BEFORE the zoom starts so it can never flicker.
      const pr = ease(clamp01((p - 0.48) / 0.14))
      screen!.style.borderColor = 'oklch(1 0 0 / ' + (0.16 * (1 - pr)).toFixed(3) + ')'

      // 4 — once the MacBook holds the stage, the demo whispers — opened
      // directly from here so a fast scroll can never miss it.
      ctl.docked = pm >= 0.95
      if (ctl.docked && ctl.enabled && ctl.openTeaser) ctl.openTeaser()
      // Scrolling back mid-message: retract the teaser fast.
      if (!ctl.docked && mbn!.classList.contains('teaser')) {
        if (ctl.closeTeaser) ctl.closeTeaser()
        mbn!.style.transition = 'width 0.18s ease, height 0.18s ease, border-radius 0.18s ease'
        mbn!.classList.remove('teaser')
        mbn!.style.width = ''
        mbn!.style.height = ''
        mbn!.style.borderRadius = ''
        mbn!.querySelectorAll<HTMLElement>('.mbn-avatar, .mbn-copy, .mbn-body').forEach((el) => {
          el.style.transition = 'opacity 0.1s ease'
          el.style.opacity = ''
        })
        setTimeout(() => {
          if (mbn!.classList.contains('teaser')) return
          // Frozen-timeline fallback: if the retract transition never ran,
          // snap to the closed state with transitions off.
          if (parseFloat(getComputedStyle(mbn!).width) > 200) {
            mbn!.style.transition = 'none'
            mbn!
              .querySelectorAll<HTMLElement>('.mbn-avatar, .mbn-copy, .mbn-body')
              .forEach((el) => {
                el.style.transition = 'none'
              })
            void mbn!.offsetWidth
            requestAnimationFrame(() => {
              mbn!.style.transition = ''
              mbn!
                .querySelectorAll<HTMLElement>('.mbn-avatar, .mbn-copy, .mbn-body')
                .forEach((el) => {
                  el.style.transition = ''
                })
            })
          } else {
            mbn!.style.transition = ''
            mbn!
              .querySelectorAll<HTMLElement>('.mbn-avatar, .mbn-copy, .mbn-body')
              .forEach((el) => {
                el.style.transition = ''
              })
          }
        }, 260)
      }
    }
    function onScroll() {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(update)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const copyMessage = () => {
    const text = msgRef.current?.textContent ?? ''
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {})
    setMsgCopied(true)
    setTimeout(() => setMsgCopied(false), 1400)
  }

  return (
    <header className="hero">
      <div className="hero-stage" ref={stageRef}>
        <div className="hero-sticky">
          <div className="container hero-copy" ref={copyRef}>
            <h1>
              Psst, your <span className="notch-word">notch</span> has something to tell&nbsp;you.
            </h1>
            <p className="lead">
              Encrypted messages, whispered from the MacBook notch. No history. The relay knows
              nothing.
            </p>
            <div className="hero-ctas">
              <a className="btn btn-primary" href={DOWNLOAD_URL}>
                <Download aria-hidden />
                Download for macOS
              </a>
              <a className="btn btn-outline" href={GITHUB_URL}>
                <GithubIcon />
                View on GitHub
              </a>
            </div>
            <div className="hero-meta">
              Free &amp; open source · macOS 14+ · works without a notch, too
            </div>
          </div>
          <div className="mockup-wrap" ref={wrapRef}>
            <div className="macbook" ref={macRef}>
              <div className="mb-screen" ref={screenRef}>
                <div className="mb-display">
                  <div className="mb-wallpaper"></div>
                  <div className="mb-menubar">
                    <div className="mb-menu">
                      <span className="mb-app">munkel</span>
                      <span>Groups</span>
                      <span>Identity</span>
                      <span>Help</span>
                    </div>
                    <div className="mb-menu-right">
                      <Wifi aria-hidden />
                      <span>{clock}</span>
                    </div>
                  </div>
                  <div className="mb-notch" ref={notchRef}>
                    <span className="notch-cam"></span>
                    <img className="mbn-avatar" ref={avatarRef} src="/avatars/01.png" alt="" />
                    <button
                      className={`mbn-copy${msgCopied ? ' copied' : ''}`}
                      onClick={copyMessage}
                      aria-label="Copy message"
                    >
                      <Copy className="ic-copy" strokeWidth={2} aria-hidden />
                      <Check className="ic-check" strokeWidth={2.5} aria-hidden />
                    </button>
                    <div className="mbn-body">
                      <div className="mbn-msg" ref={msgRef}>
                        Kaffee, jemand?
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="scroll-hint" ref={hintRef} aria-hidden>
            <ChevronDown aria-hidden />
          </div>
        </div>
      </div>
    </header>
  )
}

/* ---------- Terminal typing demo ---------- */

type TermStep = { type: 'cmd'; text: string } | { type: 'out'; html: string }

const TERM_SCRIPT: TermStep[] = [
  { type: 'cmd', text: 'munkel groups' },
  { type: 'out', html: '<span class="tdot-live">●</span> kino  <span class="tdim">·</span>  Anna, Ben, Mia' },
  { type: 'out', html: '<span class="tdot-live">●</span> wg-42  <span class="tdim">·</span>  Jurij, Sam' },
  { type: 'cmd', text: 'munkel kino all "Trailer läuft schon, wo seid ihr?"' },
  { type: 'out', html: '<span class="tdim">sent → kino (3 members)</span>' },
  { type: 'cmd', text: 'munkel wg-42 Sam "Paket für dich unten"' },
  { type: 'out', html: '<span class="tdim">sent → Sam</span>' },
]

function TerminalDemo() {
  const termRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = termRef.current
    const body = bodyRef.current
    if (!term || !body) return

    let started = false
    let cancelled = false

    async function run() {
      body!.innerHTML = ''
      for (const step of TERM_SCRIPT) {
        if (cancelled) return
        const line = document.createElement('div')
        line.className = 'tline'
        body!.appendChild(line)
        if (step.type === 'cmd') {
          line.innerHTML =
            '<span class="tprompt">$ </span><span class="ttext"></span><span class="cursor"></span>'
          const ttext = line.querySelector('.ttext')!
          for (const ch of step.text) {
            if (cancelled) return
            ttext.textContent += ch
            await sleep(28 + Math.random() * 40)
          }
          await sleep(350)
          if (cancelled) return
          line.querySelector('.cursor')?.remove()
        } else {
          line.innerHTML = step.html
          await sleep(420)
        }
      }
      if (cancelled) return
      const done = document.createElement('div')
      done.className = 'tline'
      done.innerHTML = '<span class="tprompt">$ </span><span class="cursor"></span>'
      body!.appendChild(done)
    }

    function start() {
      if (!started) {
        started = true
        run()
      }
    }
    function checkVisible() {
      const rect = term!.getBoundingClientRect()
      if (rect.top < window.innerHeight * 0.85 && rect.bottom > 0) start()
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) start()
      },
      { threshold: 0.4 },
    )
    observer.observe(term)
    window.addEventListener('scroll', checkVisible, { passive: true })
    checkVisible()
    const fallback = setTimeout(start, 12000)

    return () => {
      cancelled = true
      observer.disconnect()
      window.removeEventListener('scroll', checkVisible)
      clearTimeout(fallback)
    }
  }, [])

  return (
    <div className="terminal" ref={termRef}>
      <div className="terminal-bar">
        <span className="tdot"></span>
        <span className="tdot"></span>
        <span className="tdot"></span>
        <span className="ttitle">zsh · munkel</span>
      </div>
      <div className="terminal-body" ref={bodyRef}>
        <span className="cursor"></span>
      </div>
    </div>
  )
}

/* ---------- Install command switcher (Agents) ---------- */

const INSTALL_CMDS = {
  npx: 'npx skills add limehq/munkel',
  pnpm: 'pnpm dlx skills add limehq/munkel',
  yarn: 'yarn dlx skills add limehq/munkel',
  bun: 'bunx skills add limehq/munkel',
} as const

type Pm = keyof typeof INSTALL_CMDS

function InstallCmd() {
  const [pm, setPm] = useState<Pm>('npx')
  const [copied, setCopied] = useState(false)

  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(INSTALL_CMDS[pm]).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="install-cmd">
      <div className="install-bar">
        <div className="install-tabs" role="tablist">
          {(Object.keys(INSTALL_CMDS) as Pm[]).map((key) => (
            <button
              key={key}
              className={pm === key ? 'active' : undefined}
              role="tab"
              aria-selected={pm === key}
              onClick={() => setPm(key)}
            >
              {key}
            </button>
          ))}
        </div>
        <button
          className={`install-copy${copied ? ' copied' : ''}`}
          onClick={copy}
          aria-label="Copy command"
        >
          <Copy className="ic-copy" strokeWidth={2} aria-hidden />
          <Check className="ic-check" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
      <div className="install-body">
        <span className="prompt">$</span>
        <span>{INSTALL_CMDS[pm]}</span>
      </div>
    </div>
  )
}

/* ---------- Page ---------- */

function LandingPage() {
  return (
    <>
      <Nav />
      <Hero />

      <section id="how">
        <div className="container">
          <div className="section-head">
            <div className="section-kicker">How it works</div>
            <h2>A group is born from a code.</h2>
            <p>
              No invites, no server-side group state. Sign in with GitHub once, then three steps and
              you're whispering.
            </p>
          </div>
          <div className="steps">
            <div className="step">
              <span className="step-num">01</span>
              <h3>Create a group</h3>
              <p>
                The app mints a human-readable code. Say it across the table or paste it in a chat.
                That's the whole onboarding.
              </p>
              <div className="step-visual">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--brand)' }}>
                  kaffee-falke-42
                </span>
              </div>
            </div>
            <div className="step">
              <span className="step-num">02</span>
              <h3>Friends join</h3>
              <p>
                Anyone with the code is in. The code doubles as the AES-256-GCM key, so the relay
                only ever routes opaque blobs.
              </p>
              <div className="step-visual">
                <div className="avatar-stack">
                  <img src="/avatars/01.png" alt="Anna" />
                  <img src="/avatars/02.png" alt="Ben" />
                  <img src="/avatars/03.png" alt="Jurij" />
                  <span className="joined">3 joined</span>
                </div>
              </div>
            </div>
            <div className="step">
              <span className="step-num">03</span>
              <h3>Read the notch</h3>
              <p>
                Messages slide out, linger, disappear. Hover to keep one open, click to copy. No
                reply UI, and that's deliberate.
              </p>
              <div className="step-visual">
                <div className="mini-notch">
                  <img src="/avatars/01.png" alt="" />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="mn-name">Anna</span>
                    <span>bin in 5 unten</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features">
        <div className="container">
          <div className="section-head">
            <div className="section-kicker">Features</div>
            <h2>Small surface. Sharp edges.</h2>
            <p>Everything Munkel does, and the things it refuses to do.</p>
          </div>
          <div className="features">
            <div className="feature">
              <div className="feature-icon">
                <TimerOff aria-hidden />
              </div>
              <h3>Ephemeral by design</h3>
              <p>
                The relay holds zero state: no database, no logs of content. Messages exist only in
                flight; offline means missed, like a real whisper.
              </p>
            </div>
            <div className="feature">
              <div className="feature-icon">
                <Lock aria-hidden />
              </div>
              <h3>End-to-end encrypted</h3>
              <p>
                AES-256-GCM, key derived from the group code on-device. The relay routes ciphertext
                it cannot open. By construction, not by promise.
              </p>
            </div>
            <div className="feature">
              <div className="feature-icon">
                <UserRoundX aria-hidden />
              </div>
              <h3>No accounts of our own</h3>
              <p>
                No email, no phone number, no password. You sign in once with GitHub; Munkel runs no
                identity service and keeps nothing server-side.
              </p>
            </div>
            <div className="feature">
              <div className="feature-icon">
                <GithubIcon />
              </div>
              <h3>GitHub identity</h3>
              <p>
                Your display name and avatar come from GitHub via device flow, one login at setup.
                The token is requested with empty scope, used once, then discarded.
              </p>
            </div>
            <div className="feature">
              <div className="feature-icon">
                <Terminal aria-hidden />
              </div>
              <h3>munkel CLI</h3>
              <p>
                Send from your shell, script it, or wire it into agents over the app's control
                socket. An MCP server is on the way.
              </p>
            </div>
            <div className="feature">
              <div className="feature-icon">
                <Laptop aria-hidden />
              </div>
              <h3>Works without a notch</h3>
              <p>
                Older MacBook or external display? Messages fall back to an elegant floating panel.
                Same whisper, different hardware.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="cli">
        <div className="container">
          <div className="cli-grid">
            <div className="cli-copy">
              <div className="section-kicker">CLI</div>
              <h2>Whisper from the shell.</h2>
              <p>
                <span className="code">munkel</span> is a thin client over the app's Unix domain
                socket. The app owns all crypto and relay connections, the CLI just talks.
                Recipients by display name, groups by code prefix.
              </p>
              <p>
                Newline-delimited JSON over <span className="code">control.sock</span> makes it an
                ideal substrate for scripts and agents.
              </p>
            </div>
            <TerminalDemo />
          </div>
        </div>
      </section>

      <section id="agents">
        <div className="container">
          <div className="section-head">
            <div className="section-kicker">Agents</div>
            <h2>LLM ready.</h2>
            <p>
              The CLI is plain text in, plain text out. Anything that can run a shell can whisper,
              including the agent you already use.
            </p>
          </div>
          <InstallCmd />
          <div className="features cols-2">
            <div className="feature">
              <div className="feature-icon">
                <Bot aria-hidden />
              </div>
              <h3>Agents can send for real</h3>
              <p>
                An LLM with shell access uses <span className="code">munkel</span> exactly like you
                do: pick a person or a group, send the message. "Tell kino I'm running late" becomes
                one command.
              </p>
            </div>
            <div className="feature">
              <div className="feature-icon">
                <Package aria-hidden />
              </div>
              <h3>Skills, ready to install</h3>
              <p>
                Prepared skills teach your agent munkel's commands in one step. Install once and
                your assistant knows how to whisper.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="privacy">
        <div className="container">
          <div className="section-head">
            <div className="section-kicker">Privacy</div>
            <h2>What the relay sees.</h2>
            <p>
              One Durable Object per group, WebSocket hibernation, no storage. Ephemerality is
              enforced by architecture, not policy.
            </p>
          </div>
          <div className="privacy-grid">
            <div className="privacy-card sees">
              <h3>The relay sees</h3>
              <ul>
                <li>
                  <Info aria-hidden />
                  <span className="li-text">
                    Opaque encrypted blobs <span className="li-sub">· ciphertext it has no key for</span>
                  </span>
                </li>
                <li>
                  <Info aria-hidden />
                  <span className="li-text">
                    A group ID derived from your code <span className="li-sub">· not the code itself</span>
                  </span>
                </li>
                <li>
                  <Info aria-hidden />
                  <span className="li-text">
                    Connection timing <span className="li-sub">· that someone is online, not who</span>
                  </span>
                </li>
              </ul>
            </div>
            <div className="privacy-card never">
              <h3>The relay never sees</h3>
              <ul>
                <li>
                  <Check strokeWidth={2} aria-hidden />
                  <span className="li-text">
                    Message contents <span className="li-sub">· encrypted end-to-end</span>
                  </span>
                </li>
                <li>
                  <Check strokeWidth={2} aria-hidden />
                  <span className="li-text">
                    Names &amp; avatars <span className="li-sub">· profiles travel inside encrypted payloads</span>
                  </span>
                </li>
                <li>
                  <Check strokeWidth={2} aria-hidden />
                  <span className="li-text">
                    Any history <span className="li-sub">· nothing is ever written to storage</span>
                  </span>
                </li>
              </ul>
            </div>
          </div>
          <div className="privacy-banner">
            <div className="feature-icon">
              <MonitorOff aria-hidden />
            </div>
            <div>
              <h3>Invisible to screen sharing</h3>
              <p>
                Presenting in Zoom, Teams, or Meet? Munkel excludes its windows from screen capture.
                Whispers stay on your screen, never on the shared one.
              </p>
            </div>
          </div>
          <p className="honest">
            Honest limits: GitHub sees the device-flow login happen and lists Munkel under your
            authorized apps. Profiles are display-only; peers get no cryptographic proof that a
            member owns the GitHub name they show.
          </p>
        </div>
      </section>

      <section className="cta">
        <div className="container">
          <h2>Start whispering.</h2>
          <p>Open source, MIT licensed, one binary in your menu bar.</p>
          <div className="hero-ctas">
            <a className="btn btn-primary" href={DOWNLOAD_URL}>
              <Download aria-hidden />
              Download for macOS
            </a>
            <a className="btn btn-outline" href={GITHUB_URL}>
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <footer>
        <div className="container footer-inner">
          <span className="muted">munkel · ephemeral messages between friends.</span>
          <div className="footer-links">
            <a href={GITHUB_URL}>GitHub</a>
            <a href="#">Protocol v1</a>
            <a href="#">munkel CLI</a>
          </div>
        </div>
      </footer>
    </>
  )
}
