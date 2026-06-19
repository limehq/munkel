import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, SVGProps } from 'react'
import { BatteryMedium, Check, ChevronDown, ChevronUp, Copy, Download, Globe, Wifi } from 'lucide-react'
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'

import { Button } from '@/components/ui/button'
import { GithubIcon } from '@/components/icons'
import { DOWNLOAD_URL, GITHUB_URL } from '@/lib/constants'
import { easeInOutQuad } from '@/lib/motion'
import { sleep } from '@/lib/utils'

type Msg = {
  name: string
  text: string
  /** Lock (private to you) vs globe (the whole circle saw it). */
  direct: boolean
  /** Circle the message came from — shown in the expanded header. */
  circle: string
  /** Stable per-circle dot color, mirroring the app's groupColor. */
  color: string
}

// Circle dot colors are the app's groupPalette (system colors, dark variants),
// assigned by join order: blue, purple, pink, teal, …
const MESSAGES: Msg[] = [
  { name: 'Alex', text: 'coffee?', direct: true, circle: 'inner-circle', color: '#0a84ff' },
  { name: 'Sam', text: 'on my way', direct: false, circle: 'roomies', color: '#bf5af2' },
  { name: 'Taylor', text: 'deploy is live, go look', direct: false, circle: 'eng', color: '#ff375f' },
  { name: 'Morgan', text: 'same table as last time', direct: true, circle: 'lunch-crew', color: '#40c8e0' },
]

// Stage progress at which the notch whispers — well into the zoom, so the
// MacBook has visibly zoomed toward the notch before it triggers.
const DOCK_AT = 0.78

/** Filled padlock, matching the app's SF Symbol `lock.fill` (lucide ships only
 *  an outline Lock). Globe stays the outline lucide icon, as in the app. */
function LockFill(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
      <rect x="5" y="10.5" width="14" height="10" rx="2.6" fill="currentColor" />
    </svg>
  )
}

// macOS-style avatar for users without a photo — a 1:1 port of the app's
// AvatarView: an initial on a gradient circle, the gradient picked
// deterministically per name so a sender keeps a stable color.
const AVATAR_PALETTES: [string, string][] = [
  ['#f56b6b', '#d93069'],
  ['#5ca6fa', '#3857eb'],
  ['#66d99e', '#1a9475'],
  ['#fab84f', '#eb6b2e'],
  ['#bf85fa', '#7a40e0'],
  ['#57d6db', '#2980b8'],
]

/** FNV-1a over the name (UInt64, matching AvatarView.palette(for:)), so the
 *  color a sender gets here is the exact one the app would assign. */
function avatarPalette(name: string): [string, string] {
  let hash = 0xcbf29ce484222325n
  const mask = 0xffffffffffffffffn
  for (const byte of new TextEncoder().encode(name)) {
    hash ^= BigInt(byte)
    hash = (hash * 0x100000001b3n) & mask
  }
  return AVATAR_PALETTES[Number(hash % BigInt(AVATAR_PALETTES.length))]
}

/** First letters of up to two words, uppercased — like the app. */
function avatarInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

function Avatar({ name, className }: { name: string; className?: string }) {
  const [c1, c2] = avatarPalette(name)
  return (
    <span className={className} style={{ backgroundImage: `linear-gradient(to bottom right, ${c1}, ${c2})` }}>
      {avatarInitials(name)}
    </span>
  )
}

/** Hero: pinned scroll stage (Motion useScroll/useTransform) + notch whisper demo. */
export function Hero() {
  // Gate the reduced-motion preference behind mount: useReducedMotion() resolves
  // to false on the server but the real value on the client, so reading it during
  // render would diverge at hydration (server binds the scroll styles, a
  // reduced-motion client wouldn't). Stay false through the first client render,
  // then adopt the preference after mount.
  const prefersReduced = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const reduce = mounted && !!prefersReduced

  const stageRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const macRef = useRef<HTMLDivElement>(null)
  const notchRef = useRef<HTMLDivElement>(null)

  const [clock, setClock] = useState('Thu 9:41')
  const [msgCopied, setMsgCopied] = useState(false)
  const [copiedRow, setCopiedRow] = useState<number | null>(null)
  const [teaserOpen, setTeaserOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // "hover for details" cue under the docked notch: shown when it docks,
  // dismissed once hovered, brought back on a fresh dock.
  const [hintVisible, setHintVisible] = useState(false)
  const [msgIdx, setMsgIdx] = useState(0)
  const hoveredRef = useRef(false)
  const dockedRef = useRef(false)

  // Scroll progress over the 220vh pinned stage: 0 when its top hits the viewport
  // top, 1 when its bottom hits the viewport bottom — the same `p` the old
  // director computed from getBoundingClientRect.
  const { scrollYProgress } = useScroll({ target: stageRef, offset: ['start start', 'end end'] })

  // Phase sub-progresses (eased), mirroring the director's clamp/ease breakpoints.
  const pc = useTransform(scrollYProgress, [0, 0.38], [0, 1], { ease: easeInOutQuad })
  const pm = useTransform(scrollYProgress, [0.04, 0.64], [0, 1], { ease: easeInOutQuad })
  const pz = useTransform(scrollYProgress, [0.62, 1], [0, 1], { ease: easeInOutQuad })
  const pr = useTransform(scrollYProgress, [0.48, 0.62], [0, 1], { ease: easeInOutQuad })

  // 1 — hero copy recedes and fades out
  const copyOpacity = useTransform(pc, [0, 1], [1, 0])
  const copyY = useTransform(pc, [0, 1], [0, -64])
  const copyScale = useTransform(pc, [0, 1], [1, 0.95])
  const copyPointer = useTransform(pc, (v) => (v > 0.5 ? 'none' : 'auto'))
  // The scroll cue fades out fast as the copy starts to recede (well before the
  // notch docks, so it never overlaps the demo caption).
  const hintOpacity = useTransform(pc, [0, 0.25], [1, 0])

  // 2 — the MacBook rises to center, flattens, grows. The rise distance depends on
  // live layout, so it's measured into a ref and read by the transform.
  const wrapGeom = useRef({ targetTop: 0, offsetTop: 0 })
  const wrapY = useTransform(pm, (m) => (wrapGeom.current.targetTop - wrapGeom.current.offsetTop) * m)
  const wrapScale = useTransform(pm, [0, 1], [0.94, 1.14])

  // 3 — tilt resolves while pm runs, then pz zooms toward the notch. The transform
  // string forces `rotateX() scale()` order (Motion's default scale→rotate order
  // would shift the pinned top edge under the parent's perspective).
  const macRotateX = useTransform(pm, [0, 1], [22, 0])
  const macScale = useTransform(pz, [0, 1], [1, 1.45])
  const macTransform = useTransform(() => `rotateX(${macRotateX.get()}deg) scale(${macScale.get()})`)
  const macOpacity = useTransform(pm, [0, 1], [0.55, 1])
  // The 1px rim hairline aliases in/out under non-integer scale — fade it out
  // before the zoom so it can never flicker.
  const rimColor = useTransform(pr, (v) => `oklch(1 0 0 / ${(0.16 * (1 - v)).toFixed(3)})`)

  useEffect(() => {
    const now = new Date()
    setClock(
      now.toLocaleDateString('en-US', { weekday: 'short' }) +
        ' ' +
        now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }),
    )
  }, [])

  // Measure the mockup geometry for the rise translate (and keep it fresh on resize).
  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current
      if (!wrap) return
      wrapGeom.current = {
        targetTop: (window.innerHeight - wrap.offsetHeight) / 2,
        offsetTop: wrap.offsetTop,
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Reduced motion: no scrubbed timeline — show the first whisper statically.
  useEffect(() => {
    if (reduce) setTeaserOpen(true)
  }, [reduce])

  // Dock latch — the notch whispers ONLY once you've scrolled well into the zoom
  // (DOCK_AT of the stage progress, i.e. zoomed close to the notch), never on
  // load; scrolling back above that point retracts it.
  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    if (reduce) return
    if (p >= DOCK_AT && !dockedRef.current) {
      dockedRef.current = true
      setTeaserOpen(true)
      setHintVisible(true)
    } else if (p < DOCK_AT && dockedRef.current) {
      dockedRef.current = false
      setTeaserOpen(false)
      setExpanded(false)
      setHintVisible(false)
    }
  })

  // Hover pauses rotation and dismisses the caption — fine pointers only (a tap on
  // touch fires mouseenter with no matching mouseleave and would freeze rotation).
  useEffect(() => {
    const root = notchRef.current
    if (!root) return
    if (!window.matchMedia('(hover: hover)').matches) return
    const onEnter = () => {
      hoveredRef.current = true
      // Hover swells the docked teaser into the full message card — like the
      // real notch. Hovering the closed pill (pre-dock) does nothing.
      if (dockedRef.current) setExpanded(true)
      // Dismiss the cue once they've taken the hint; it returns on a fresh dock.
      setHintVisible(false)
    }
    const onLeave = () => {
      hoveredRef.current = false
      setExpanded(false)
    }
    root.addEventListener('mouseenter', onEnter)
    root.addEventListener('mouseleave', onLeave)
    return () => {
      root.removeEventListener('mouseenter', onEnter)
      root.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // Message rotation — advances the current message only while the notch is
  // docked, pausing while hovered (the expanded card freezes on whatever you're
  // reading). The effect cleanup guarantees exactly one live loop: a
  // close/reopen tears down the previous loop before the next mounts. Each
  // message cross-fades in via CSS keyed on the index (see `.nt-fade`).
  useEffect(() => {
    if (!teaserOpen || reduce) return
    let alive = true
    const dwell = window.matchMedia('(hover: hover)').matches ? 3400 : 5000
    void (async () => {
      while (alive) {
        await sleep(dwell)
        while (hoveredRef.current && alive) await sleep(300)
        if (!alive) break
        setMsgIdx((i) => (i + 1) % MESSAGES.length)
      }
    })()
    return () => {
      alive = false
    }
  }, [teaserOpen, reduce])

  const copyText = (text: string) => {
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {})
  }
  const copyMessage = () => {
    copyText(MESSAGES[msgIdx].text)
    setMsgCopied(true)
    setTimeout(() => setMsgCopied(false), 1400)
  }
  const copyRow = (idx: number, text: string) => {
    copyText(text)
    setCopiedRow(idx)
    setTimeout(() => setCopiedRow((r) => (r === idx ? null : r)), 1400)
  }

  const msg = MESSAGES[msgIdx]
  const ChanIcon = msg.direct ? LockFill : Globe
  // The pulse-ring color = the avatar's first palette color, like the app.
  const ring = avatarPalette(msg.name)[0]
  // The two most recently shown messages, newest first — the "last minute"
  // backlog the real notch stacks under the current one.
  const history = [1, 2].map((back) => {
    const i = (msgIdx - back + MESSAGES.length) % MESSAGES.length
    return { ...MESSAGES[i], idx: i }
  })

  return (
    <header className="hero">
      <div className="hero-stage" ref={stageRef}>
        <div className="hero-sticky">
          <motion.div
            className="container hero-copy"
            style={
              reduce
                ? undefined
                : { opacity: copyOpacity, y: copyY, scale: copyScale, pointerEvents: copyPointer }
            }
          >
            <div className="hero-kicker">Ephemeral circle messages for macOS</div>
            <h1>
              Psst, your <span className="notch-word">notch</span> has something to tell&nbsp;you.
            </h1>
            <p className="lead">
              Quick pings between friends, end-to-end encrypted — they slide out of the notch,
              linger a moment, and vanish. Nothing is ever stored.
            </p>
            <div className="hero-ctas">
              <Button asChild variant="primary">
                <a href={DOWNLOAD_URL}>
                  <Download aria-hidden />
                  Download for macOS
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={GITHUB_URL}>
                  <GithubIcon />
                  View on GitHub
                </a>
              </Button>
            </div>
            <div className="hero-meta">
              Free &amp; open source · macOS 14+ · Apple Silicon &amp; Intel · Signed &amp;
              notarized · works without a notch, too
            </div>
          </motion.div>
          <motion.div
            className="mockup-wrap"
            ref={wrapRef}
            style={reduce ? undefined : { y: wrapY, scale: wrapScale }}
          >
            <motion.div
              className="macbook"
              ref={macRef}
              style={reduce ? undefined : { transform: macTransform, opacity: macOpacity }}
            >
              <motion.div
                className="mb-screen"
                style={reduce ? undefined : { borderColor: rimColor }}
              >
                <div className="mb-display">
                  <div className="mb-wallpaper"></div>
                  <div className="mb-menubar">
                    <div className="mb-menu">
                      {/* U+F8FF renders as the Apple logo in the system font on
                          Apple devices (the landing's audience). */}
                      <span className="mb-apple" aria-hidden>&#xF8FF;</span>
                      <span className="mb-app">munkel</span>
                      <span>Circles</span>
                      <span>Identity</span>
                      <span>Help</span>
                    </div>
                    <div className="mb-menu-right">
                      <BatteryMedium aria-hidden />
                      <Wifi aria-hidden />
                      <span className="mb-clock">{clock}</span>
                    </div>
                  </div>
                  <div
                    className={`mb-notch${teaserOpen ? ' docked' : ''}${
                      expanded ? ' expanded' : ''
                    }`}
                    ref={notchRef}
                  >
                    <span className="notch-cam"></span>

                    {/* Compact teaser — what the notch shows at rest: avatar and
                        copy tucked into the menu-bar strip flanking the camera,
                        with the one-line message running below it. */}
                    <div className="nt">
                      {/* Pulse ring behind the avatar (the app's CompactAvatarView
                          "ping"), in the sender's color. Rendered only while docked
                          and keyed on the message, so it fires when the notch opens
                          and replays on each rotation — not silently on page load. */}
                      {teaserOpen && (
                        <span
                          className="nt-ping"
                          key={`p${msgIdx}`}
                          style={{ '--ring': ring } as CSSProperties}
                          aria-hidden
                        />
                      )}
                      <Avatar key={`a${msgIdx}`} name={msg.name} className="nt-avatar nt-fade" />
                      <button
                        className={`nt-copy${msgCopied ? ' copied' : ''}`}
                        onClick={copyMessage}
                        aria-label="Copy message"
                      >
                        <Copy className="ic-copy" strokeWidth={2} aria-hidden />
                        <Check className="ic-check" strokeWidth={2.5} aria-hidden />
                      </button>
                      {/* Channel icon leads the line (and stays put while the text
                          tickers), vertically centered with the single-line text. */}
                      <div className="nt-line nt-fade" key={`t${msgIdx}`}>
                        <ChanIcon
                          className={`nt-chan${msg.direct ? '' : ' is-globe'}`}
                          strokeWidth={1.8}
                          aria-hidden
                        />
                        <span className="nt-text">{msg.text}</span>
                      </div>
                    </div>

                    {/* Expanded card — the full message view the real notch
                        swells into on hover: avatar, sender + circle header,
                        message, reply field, and the last-minute history. */}
                    <div className="nx" aria-hidden={!expanded}>
                      <div className="nx-msg">
                        <Avatar name={msg.name} className="nx-avatar" />
                        <div className="nx-col">
                          <div className="nx-head">
                            <span className="nx-sender">{msg.name}</span>
                            <ChanIcon
                              className={`nx-chan${msg.direct ? '' : ' is-globe'}`}
                              strokeWidth={1.8}
                              aria-hidden
                            />
                            <span className="nx-sep">·</span>
                            <span className="nx-cdot" style={{ background: msg.color }} />
                            <span className="nx-circle">{msg.circle}</span>
                          </div>
                          <div className="nx-text">{msg.text}</div>
                        </div>
                        <button
                          className={`nx-copy${msgCopied ? ' copied' : ''}`}
                          onClick={copyMessage}
                          aria-label="Copy message"
                        >
                          <Copy className="ic-copy" strokeWidth={2} aria-hidden />
                          <Check className="ic-check" strokeWidth={2.5} aria-hidden />
                        </button>
                      </div>

                      <div className="nx-reply">
                        <span className="nx-chip">
                          <ChanIcon
                            className={msg.direct ? undefined : 'is-globe'}
                            strokeWidth={2}
                            aria-hidden
                          />
                        </span>
                        <div className="nx-input">
                          {msg.direct ? `Private to ${msg.name}…` : 'Reply to all…'}
                        </div>
                      </div>

                      <div className="nx-history">
                        <div className="nx-rule" />
                        {history.map((h) => {
                          const RowIcon = h.direct ? LockFill : Globe
                          return (
                            <button
                              key={h.idx}
                              className={`nx-row${copiedRow === h.idx ? ' copied' : ''}`}
                              onClick={() => copyRow(h.idx, h.text)}
                            >
                              <span className="nx-rhead">
                                <span className="nx-rdot" style={{ background: h.color }} />
                                <span className="nx-rsender">{h.name}</span>
                                <RowIcon
                                  className={`nx-rchan${h.direct ? '' : ' is-globe'}`}
                                  strokeWidth={1.8}
                                  aria-hidden
                                />
                              </span>
                              <span className="nx-rtext">{h.text}</span>
                              <span className="nx-rcopy">
                                <Copy className="ic-copy" strokeWidth={2} aria-hidden />
                                <Check className="ic-check" strokeWidth={2.5} aria-hidden />
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  {/* "hover for details" cue, just below the docked notch (so it
                      tracks the notch under the zoom); fades on hover, returns
                      on a fresh dock. */}
                  <div className={`notch-hint${hintVisible ? ' show' : ''}`} aria-hidden>
                    <ChevronUp aria-hidden />
                    <span>hover for details</span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
          <motion.div className="scroll-hint" style={reduce ? undefined : { opacity: hintOpacity }}>
            <span>See it munkel</span>
            <ChevronDown aria-hidden />
          </motion.div>
        </div>
      </div>
    </header>
  )
}
