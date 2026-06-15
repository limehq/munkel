import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, Download, Wifi } from 'lucide-react'
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'

import { Button } from '@/components/ui/button'
import { GithubIcon } from '@/components/icons'
import { DOWNLOAD_URL, GITHUB_URL } from '@/lib/constants'
import { easeInOutQuad } from '@/lib/motion'
import { sleep } from '@/lib/utils'

const MESSAGES = [
  { name: 'Alex', avatar: '/avatars/01.png', text: 'coffee?' },
  { name: 'Sam', avatar: '/avatars/02.png', text: 'on my way' },
  { name: 'Taylor', avatar: '/avatars/03.png', text: 'deploy is live, go look' },
  { name: 'Morgan', avatar: '/avatars/05.png', text: 'same table as last time' },
]

// Stage progress at which the notch whispers — well into the zoom, so the
// MacBook has visibly zoomed toward the notch before it triggers.
const DOCK_AT = 0.78

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
  const msgRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLImageElement>(null)
  const demoHintRef = useRef<HTMLDivElement>(null)

  const [clock, setClock] = useState('Thu 9:41')
  const [msgCopied, setMsgCopied] = useState(false)
  const [teaserOpen, setTeaserOpen] = useState(false)
  const hoveredRef = useRef(false)
  const msgIdxRef = useRef(0)
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
      demoHintRef.current?.classList.add('show')
    } else if (p < DOCK_AT && dockedRef.current) {
      dockedRef.current = false
      setTeaserOpen(false)
      demoHintRef.current?.classList.remove('show')
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
      const cap = demoHintRef.current
      if (cap?.classList.contains('show')) cap.classList.add('off')
    }
    const onLeave = () => {
      hoveredRef.current = false
    }
    root.addEventListener('mouseenter', onEnter)
    root.addEventListener('mouseleave', onLeave)
    return () => {
      root.removeEventListener('mouseenter', onEnter)
      root.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // Message rotation — runs only while the notch is open. The effect cleanup
  // guarantees exactly one live loop (it replaces the old session-token machinery):
  // a close/reopen tears down the previous loop before the next mounts.
  useEffect(() => {
    if (!teaserOpen || reduce) return
    const elMsg = msgRef.current
    const elAvatar = avatarRef.current
    if (!elMsg || !elAvatar) return

    let alive = true
    const dwell = window.matchMedia('(hover: hover)').matches ? 3400 : 5000

    const first = MESSAGES[msgIdxRef.current % MESSAGES.length]
    elMsg.textContent = first.text
    elAvatar.src = first.avatar
    msgIdxRef.current++

    void (async () => {
      while (alive) {
        await sleep(dwell)
        while (hoveredRef.current && alive) await sleep(300)
        if (!alive) break
        const next = MESSAGES[msgIdxRef.current % MESSAGES.length]
        msgIdxRef.current++
        elMsg.style.transition = 'opacity 0.18s ease'
        elAvatar.style.transition = 'opacity 0.18s ease'
        elMsg.style.opacity = '0'
        elAvatar.style.opacity = '0'
        await sleep(200)
        if (!alive) break
        elMsg.textContent = next.text
        elAvatar.src = next.avatar
        elMsg.style.opacity = '1'
        elAvatar.style.opacity = '1'
        await sleep(220)
        if (!alive) break
        elMsg.style.transition = ''
        elAvatar.style.transition = ''
        elMsg.style.opacity = ''
        elAvatar.style.opacity = ''
      }
    })()

    return () => {
      alive = false
      elMsg.style.transition = ''
      elAvatar.style.transition = ''
      elMsg.style.opacity = ''
      elAvatar.style.opacity = ''
    }
  }, [teaserOpen, reduce])

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
                      <span className="mb-app">munkel</span>
                      <span>Circles</span>
                      <span>Identity</span>
                      <span>Help</span>
                    </div>
                    <div className="mb-menu-right">
                      <Wifi aria-hidden />
                      <span>{clock}</span>
                    </div>
                  </div>
                  <div
                    className={`mb-notch${teaserOpen ? ' teaser' : ''}`}
                    ref={notchRef}
                    onClick={() => {
                      // In the page demo a click copies the message (the real
                      // notch opens an inline reply on click).
                      if (teaserOpen) copyMessage()
                    }}
                  >
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
                        coffee?
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
          <div className="demo-caption" ref={demoHintRef} aria-hidden>
            hover to hold a munkel open — just like the real thing
          </div>
          <motion.div className="scroll-hint" style={reduce ? undefined : { opacity: hintOpacity }}>
            <span>See it munkel</span>
            <ChevronDown aria-hidden />
          </motion.div>
        </div>
      </div>
    </header>
  )
}
