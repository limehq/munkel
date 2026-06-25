import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, SVGProps } from 'react'
import { BatteryMedium, Check, ChevronDown, ChevronUp, Copy, Globe, Wifi } from 'lucide-react'
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'

import { DownloadButton } from '@/components/download-button'
import { GithubButton } from '@/components/github-button'
import { easeInOutQuad } from '@/lib/motion'
import { sleep } from '@/lib/utils'

type Msg = {
  name: string
  text: string
  direct: boolean
  circle: string
  color: string
}

const MESSAGES: Msg[] = [
  { name: 'Alex', text: 'coffee?', direct: true, circle: 'inner-loop', color: '#0a84ff' },
  { name: 'Sam', text: 'on my way', direct: false, circle: 'roomies', color: '#bf5af2' },
  { name: 'Taylor', text: 'deploy is live, go look', direct: false, circle: 'eng', color: '#ff375f' },
  { name: 'Morgan', text: 'same table as last time', direct: true, circle: 'lunch-crew', color: '#40c8e0' },
]

const DOCK_AT = 0.48

function LockFill(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
      <rect x="5" y="10.5" width="14" height="10" rx="2.6" fill="currentColor" />
    </svg>
  )
}

const AVATAR_PALETTES: [string, string][] = [
  ['#f56b6b', '#d93069'],
  ['#5ca6fa', '#3857eb'],
  ['#66d99e', '#1a9475'],
  ['#fab84f', '#eb6b2e'],
  ['#bf85fa', '#7a40e0'],
  ['#57d6db', '#2980b8'],
]

function avatarPalette(name: string): [string, string] {
  let hash = 0xcbf29ce484222325n
  const mask = 0xffffffffffffffffn
  for (const byte of new TextEncoder().encode(name)) {
    hash ^= BigInt(byte)
    hash = (hash * 0x100000001b3n) & mask
  }
  return AVATAR_PALETTES[Number(hash % BigInt(AVATAR_PALETTES.length))]
}

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

export function Hero() {
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
  const [hintVisible, setHintVisible] = useState(false)
  const [msgIdx, setMsgIdx] = useState(0)
  const hoveredRef = useRef(false)
  const dockedRef = useRef(false)

  const { scrollY } = useScroll()
  const scrub = useMotionValue(typeof window === 'undefined' ? 1000 : window.innerHeight * 1.2)
  const scrollYProgress = useTransform(() => Math.min(1, Math.max(0, scrollY.get() / scrub.get())))

  const pc = useTransform(scrollYProgress, [0, 0.3], [0, 1])
  const pm = useTransform(scrollYProgress, [0, 0.34], [0, 1])
  const pz = useTransform(scrollYProgress, [0.3, 1], [0, 1], { ease: easeInOutQuad })
  const pr = useTransform(scrollYProgress, [0.24, 0.34], [0, 1], { ease: easeInOutQuad })

  const copyOpacity = useTransform(pm, [0.4, 0.9], [1, 0])
  const copyZ = useTransform(pc, [0, 1], [0, -140])
  const copyPointer = useTransform(pc, (v) => (v > 0.5 ? 'none' : 'auto'))
  const hintOpacity = useTransform(pc, [0, 0.25], [1, 0])

  const wrapGeom = useRef({ targetTop: 0, offsetTop: 0 })
  const wrapY = useTransform(pm, (m) => (wrapGeom.current.targetTop - wrapGeom.current.offsetTop) * m)
  const wrapScale = useTransform(pm, [0, 1], [0.94, 1.14])

  const macRotateX = useTransform(pm, [0, 1], [22, 0])
  const macScale = useTransform(pz, [0, 1], [1, 1.42])
  const macTransform = useTransform(() => `rotateX(${macRotateX.get()}deg) scale(${macScale.get()})`)
  const macOpacity = useTransform(pm, [0, 1], [0.55, 1])
  const rimColor = useTransform(pr, (v) => `oklch(1 0 0 / ${(0.16 * (1 - v)).toFixed(3)})`)

  useEffect(() => {
    const now = new Date()
    setClock(
      now.toLocaleDateString('en-US', { weekday: 'short' }) +
        ' ' +
        now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }),
    )
  }, [])

  useEffect(() => {
    const measure = () => {
      const stage = stageRef.current
      if (stage) scrub.set(Math.max(1, stage.offsetHeight - window.innerHeight))
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

  useEffect(() => {
    if (reduce) setTeaserOpen(true)
  }, [reduce])

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

  useEffect(() => {
    const root = notchRef.current
    if (!root) return
    if (!window.matchMedia('(hover: hover)').matches) return
    const onEnter = () => {
      hoveredRef.current = true
      if (dockedRef.current) setExpanded(true)
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
  const ring = avatarPalette(msg.name)[0]
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
                : { opacity: copyOpacity, z: copyZ, transformPerspective: 1000, pointerEvents: copyPointer }
            }
          >
            <div className="app-icon">
              <img src="/app-icon.png" alt="The Munkel meerkat, paws to its mouth" width={112} height={112} />
            </div>
            <div className="hero-kicker">Quiet little messages</div>
            <h1>
              Psst. Your <span className="notch-word">notch</span> is whispering.
            </h1>
            <p className="lead">
              The kind of note you'd say across a table. It slips into your notch, then it's gone.
            </p>
            <div className="hero-ctas">
              <DownloadButton location="hero" />
              <GithubButton location="hero" />
            </div>
            <div className="hero-meta">Free and open source · macOS 14+</div>
          </motion.div>
          <motion.div
            className="mockup-wrap"
            ref={wrapRef}
            style={reduce ? undefined : { y: wrapY }}
          >
            <div className="mockup-backdrop" aria-hidden />
            <motion.div className="mockup-fade" style={reduce ? undefined : { scale: wrapScale }}>
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
                      <span className="mb-apple" aria-hidden>&#xF8FF;</span>
                    </div>
                    <div className="mb-menu-right">
                      <BatteryMedium aria-hidden />
                      <Wifi aria-hidden />
                      <span className="mb-clock">{clock}</span>
                    </div>
                  </div>
                </div>
                <div
                  className={`mb-notch${teaserOpen ? ' docked' : ''}${
                    expanded ? ' expanded' : ''
                  }`}
                  ref={notchRef}
                >
                    <span className="notch-cam"></span>

                    <div className="nt">
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
                      <div className="nt-line nt-fade" key={`t${msgIdx}`}>
                        <ChanIcon
                          className={`nt-chan${msg.direct ? '' : ' is-globe'}`}
                          strokeWidth={1.8}
                          aria-hidden
                        />
                        <span className="nt-text">{msg.text}</span>
                      </div>
                    </div>

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
                  <div className={`notch-hint${hintVisible ? ' show' : ''}`} aria-hidden>
                    <ChevronUp aria-hidden />
                    <span>hover for details</span>
                  </div>
              </motion.div>
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
