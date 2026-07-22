import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, SVGProps } from 'react'
import { Check, ChevronDown, ChevronUp, Copy, Globe } from 'lucide-react'
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'

import { DownloadButton } from '@/components/download-button'
import { GithubButton } from '@/components/github-button'
import { MenuBarBattery, MenuBarWifi } from '@/components/icons'
import { easeInOutQuad } from '@/lib/motion'
import { cn, sleep } from '@/lib/utils'

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
  const [draft, setDraft] = useState('')
  const [sent, setSent] = useState<Msg[]>([])
  const [composing, setComposing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const interactingRef = useRef(false)
  const interacting = composing
  useEffect(() => {
    interactingRef.current = interacting
  }, [interacting])

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
      setDraft('')
      setComposing(false)
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
      if (!interactingRef.current) {
        setExpanded(false)
        setDraft('')
      }
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
        while ((hoveredRef.current || interactingRef.current) && alive) await sleep(300)
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
    <header className="p-0 text-center relative overflow-clip before:content-[''] before:absolute before:[inset:-300px_-20%_auto_-20%] before:h-[110lvh] before:[background:radial-gradient(ellipse_50%_60%_at_50%_0%,var(--brand-soft),transparent_70%)] before:pointer-events-none">
      <div className="h-[320lvh] relative max-[900px]:h-[300lvh] motion-reduce:h-auto" ref={stageRef}>
        <div className="sticky top-0 h-[100lvh] overflow-hidden motion-reduce:static motion-reduce:h-auto motion-reduce:overflow-visible motion-reduce:py-24">
          <motion.div
            className="mx-auto max-w-[1400px] px-8 relative pt-[12vh] [will-change:transform,opacity] z-[2] max-[900px]:pt-[8vh]"
            style={
              reduce
                ? undefined
                : { opacity: copyOpacity, z: copyZ, transformPerspective: 1000, pointerEvents: copyPointer }
            }
          >
            <div className="block w-[112px] mx-auto mb-7">
              <img
                src="/app-icon.webp"
                alt="The Munkel meerkat, paws to its mouth"
                width={112}
                height={112}
                fetchPriority="high"
                className="w-full h-auto block [filter:drop-shadow(0_14px_28px_oklch(0_0_0_/_0.5))]"
              />
            </div>
            <div className="font-mono text-[length:var(--text-xs)] text-brand tracking-[0.06em] uppercase mb-5">Quiet little messages</div>
            <h1 className="text-[clamp(2.5rem,6vw,4.25rem)] font-bold tracking-[-0.035em] leading-[1.05] max-w-[17ch] mx-auto text-balance">
              Psst. Your{' '}
              <span className="text-transparent bg-clip-text [-webkit-background-clip:text] [background-image:radial-gradient(circle_0.11em_at_42%_30%,oklch(0.98_0.02_250),oklch(0.98_0.02_250_/_0)_100%),radial-gradient(circle_0.26em_at_60%_66%,oklch(0.5_0.15_295_/_0.85),transparent_100%),radial-gradient(circle_0.46em_at_50%_50%,transparent_80%,oklch(0.72_0.06_255_/_0.5)_88%,transparent_98%),radial-gradient(circle_0.72em_at_50%_50%,oklch(0.58_0.1_255),oklch(0.36_0.08_260)_35%,oklch(0.18_0.04_262)_65%,oklch(0.08_0.015_260)_90%,oklch(0.04_0_0)_100%),radial-gradient(circle_0.82em_at_50%_50%,transparent_84%,oklch(0.78_0.05_250_/_0.9)_90%,oklch(0.45_0.04_255_/_0.6)_96%,transparent_100%),linear-gradient(180deg,oklch(0.21_0.008_260),oklch(0.06_0_0))] dark:[-webkit-text-stroke:1.5px_oklch(1_0_0_/_0.6)] dark:[text-shadow:0_0_calc(var(--glow)*22px)_color-mix(in_oklab,var(--brand)_60%,transparent),0_0_calc(var(--glow)*80px)_color-mix(in_oklab,var(--brand)_35%,transparent)]">
                notch
              </span>{' '}
              is whispering.
            </h1>
            <p className="max-w-[40ch] mt-7 mx-auto text-[length:var(--text-lg)] leading-relaxed text-muted-foreground text-balance">
              The kind of note you'd say across a table. It slips into your notch, then it's gone.
            </p>
            <div className="mt-10 flex justify-center gap-3 flex-wrap">
              <DownloadButton location="hero" />
              <GithubButton location="hero" />
            </div>
            <div className="mt-5 text-[length:var(--text-xs)] text-muted-foreground">Free and open source · macOS 14+</div>
          </motion.div>
          <motion.div
            className="relative z-[3] mt-[5vh] mx-auto h-[clamp(200px,40vw,390px)] overflow-hidden max-[900px]:mt-12 after:content-[''] after:absolute after:inset-0 after:pointer-events-none after:[background:radial-gradient(46%_60%_at_0%_100%,var(--background)_32%,transparent_80%),radial-gradient(46%_60%_at_100%_100%,var(--background)_32%,transparent_80%),linear-gradient(to_bottom,transparent_74%,var(--background)_100%)]"
            ref={wrapRef}
            style={reduce ? undefined : { y: wrapY }}
          >
            <div className="absolute inset-0 bg-background" aria-hidden />
            <motion.div className="absolute inset-0 [perspective:1600px] [transform-origin:50%_0%] [will-change:transform]" style={reduce ? undefined : { scale: wrapScale }}>
            <motion.div
              className="[transform-origin:50%_0%] max-w-[1000px] mx-auto motion-reduce:[transform:none]! motion-reduce:opacity-100!"
              ref={macRef}
              style={reduce ? undefined : { transform: macTransform, opacity: macOpacity }}
            >
              <motion.div
                className="relative aspect-[16/10] bg-black rounded-[22px] border border-[oklch(1_0_0_/_0.16)] shadow-[0_40px_80px_-32px_oklch(0_0_0_/_0.5)]"
                style={reduce ? undefined : { borderColor: rimColor }}
              >
                <div className="absolute inset-2 rounded-[14px] overflow-hidden bg-[oklch(0.11_0_0)]">
                  <div className="absolute inset-0 [background:radial-gradient(70%_55%_at_50%_0%,color-mix(in_oklab,var(--brand)_32%,oklch(0.15_0.01_250)),transparent_80%),radial-gradient(50%_45%_at_12%_70%,color-mix(in_oklab,var(--brand)_12%,oklch(0.13_0_0)),transparent_70%),linear-gradient(180deg,oklch(0.14_0.008_250),oklch(0.1_0.005_260))]"></div>
                  <div className="absolute top-0 left-0 right-0 h-[28px] flex items-center justify-between px-[14px] [font-family:-apple-system,system-ui,sans-serif] text-[13px] text-[oklch(0.97_0_0_/_0.85)] bg-[oklch(0_0_0_/_0.5)] backdrop-blur-[12px] max-[900px]:h-[21px] max-[900px]:text-[11px] max-[600px]:h-[16px] max-[600px]:text-[9px]">
                    <div className="flex items-center gap-[15px]">
                      <span className="text-[15px] leading-[0] opacity-[0.92] max-[900px]:text-[13px] max-[600px]:text-[11px]" aria-hidden>&#xF8FF;</span>
                    </div>
                    <div className="flex items-center gap-[11px] [font-variant-numeric:tabular-nums]">
                      <MenuBarBattery className="w-[24px] h-[12px] max-[900px]:w-[20px] max-[900px]:h-[10px] max-[600px]:w-[16px] max-[600px]:h-[8px]" />
                      <MenuBarWifi className="w-[15px] h-[12px] max-[900px]:w-[13px] max-[900px]:h-[10px] max-[600px]:w-[11px] max-[600px]:h-[9px]" />
                      <span className="font-medium">{clock}</span>
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    "absolute top-[7px] left-1/2 bg-black z-[5] [transform:translateX(-50%)] [transform-origin:top_center] max-[900px]:[transform:translateX(-50%)_scale(0.75)] max-[600px]:[transform:translateX(-50%)_scale(0.58)] [transition:width_0.42s_cubic-bezier(0.33,1,0.68,1),height_0.42s_cubic-bezier(0.33,1,0.68,1),clip-path_0.42s_cubic-bezier(0.33,1,0.68,1),filter_0.3s_ease] motion-reduce:[transition:none]",
                    !teaserOpen &&
                      "w-[128px] h-[25px] [clip-path:path('M0_0_Q8_0_8_8_L8_16_Q8_25_17_25_L111_25_Q120_25_120_16_L120_8_Q120_0_128_0_Z')]",
                    teaserOpen &&
                      "w-[310px] cursor-pointer [filter:drop-shadow(0_10px_16px_oklch(0_0_0_/_0.5))]",
                    teaserOpen &&
                      !expanded &&
                      "h-[58px] [clip-path:path('M0_0_Q15_0_15_15_L15_38_Q15_58_35_58_L275_58_Q295_58_295_38_L295_15_Q295_0_310_0_Z')]",
                    teaserOpen &&
                      expanded &&
                      "h-[180px] [clip-path:path('M0_0_Q15_0_15_15_L15_160_Q15_180_35_180_L275_180_Q295_180_295_160_L295_15_Q295_0_310_0_Z')]",
                  )}
                  ref={notchRef}
                  onClick={(e) => {
                    if (!teaserOpen) return
                    if ((e.target as HTMLElement).closest('button, input')) return
                    setExpanded(true)
                    if (window.matchMedia('(hover: hover)').matches) {
                      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
                    }
                  }}
                >
                    <span className={cn('absolute top-[9px] left-1/2 [transform:translateX(-50%)] w-[9px] h-[9px] rounded-full [background:radial-gradient(circle_at_35%_35%,oklch(0.38_0.05_250),oklch(0.17_0.03_255)_55%,oklch(0.05_0_0)_100%)] [box-shadow:0_0_0_1.5px_oklch(0.09_0_0),inset_0_0_2px_oklch(0.6_0.08_250_/_0.5)]', teaserOpen && 'top-[11px] w-[7px] h-[7px] z-[3]')}></span>

                    <div className={cn("absolute inset-0 overflow-hidden rounded-b-[20px] opacity-0 invisible [transition:opacity_0.2s_ease,visibility_0s_linear_0.2s] [font-family:system-ui,-apple-system,sans-serif] [-webkit-font-smoothing:antialiased]", teaserOpen && !expanded && 'opacity-100 visible [transition:opacity_0.25s_ease_0.1s,visibility_0s]', teaserOpen && expanded && '[transition:opacity_0.12s_ease,visibility_0s_linear_0.12s]')}>
                      {teaserOpen && (
                        <span
                          className="absolute top-[6px] left-[30px] w-[20px] h-[20px] rounded-full border border-[var(--ring,#fff)] pointer-events-none animate-[nt-ping_1s_ease-out_0.55s_both] motion-reduce:animate-none"
                          key={`p${msgIdx}`}
                          style={{ '--ring': ring } as CSSProperties}
                          aria-hidden
                        />
                      )}
                      <Avatar key={`a${msgIdx}`} name={msg.name} className="absolute top-[6px] left-[30px] w-[20px] h-[20px] rounded-full flex items-center justify-center [font-family:ui-rounded,system-ui,sans-serif] font-bold text-[7.6px] leading-[1] text-white animate-[nt-in_0.32s_ease_both] motion-reduce:animate-none" />
                      <button
                        className="absolute top-[6px] right-[30px] w-[20px] h-[20px] rounded-full inline-flex items-center justify-center border-0 p-0 cursor-pointer bg-[oklch(1_0_0_/_0.1)] text-[oklch(1_0_0_/_0.65)] transition-[background] duration-150 hover:bg-[oklch(1_0_0_/_0.18)]"
                        onClick={copyMessage}
                        aria-label="Copy message"
                      >
                        <Copy className={cn('w-[9px]! h-[9px]!', msgCopied && 'hidden')} strokeWidth={2} aria-hidden />
                        <Check className={cn('w-[9px]! h-[9px]! text-brand', msgCopied ? 'block' : 'hidden')} strokeWidth={2.5} aria-hidden />
                      </button>
                      <div className="absolute top-[34px] left-[30px] right-[30px] flex items-center gap-[5px] animate-[nt-in_0.32s_ease_both] motion-reduce:animate-none" key={`t${msgIdx}`}>
                        <ChanIcon
                          className={cn('flex-none w-[11px]! h-[11px]! text-[oklch(1_0_0_/_0.55)]', !msg.direct && 'w-[9.5px]! h-[9.5px]!')}
                          strokeWidth={1.8}
                          aria-hidden
                        />
                        <span className="flex-[0_1_auto] min-w-0 [font-family:ui-rounded,system-ui,sans-serif] text-[12px] font-medium leading-[1.2] text-[oklch(1_0_0_/_0.85)] whitespace-nowrap overflow-hidden text-ellipsis">{msg.text}</span>
                      </div>
                    </div>

                    <div className={cn("absolute inset-0 overflow-hidden rounded-b-[20px] opacity-0 invisible [transition:opacity_0.2s_ease,visibility_0s_linear_0.2s] [font-family:system-ui,-apple-system,sans-serif] [-webkit-font-smoothing:antialiased] flex flex-col [padding:32px_30px_15px] gap-[5px] text-left", expanded && 'opacity-100 visible [transition:opacity_0.22s_ease_0.08s,visibility_0s]')} aria-hidden={!expanded}>
                      <div className="flex items-start gap-[12px] [padding:4px_6px]">
                        <Avatar name={msg.name} className="flex-none w-[34px] h-[34px] rounded-full flex items-center justify-center [font-family:ui-rounded,system-ui,sans-serif] font-bold text-[13px] leading-[1] text-white" />
                        <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                          <div className="flex items-center gap-[4px] leading-[1.1] text-[oklch(1_0_0_/_0.55)]">
                            <span className="text-[11px] font-semibold">{msg.name}</span>
                            <ChanIcon
                              className={cn('flex-none w-[10px]! h-[10px]!', !msg.direct && 'w-[8.5px]! h-[8.5px]!')}
                              strokeWidth={1.8}
                              aria-hidden
                            />
                            <span className="text-[12px]">·</span>
                            <span className="flex-none w-[6px] h-[6px] rounded-full" style={{ background: msg.color }} />
                            <span>{msg.circle}</span>
                          </div>
                          <div className="text-[14px] font-medium leading-[1.2] text-white">{msg.text}</div>
                        </div>
                        <button
                          className="flex-none mt-[-2px] w-[20px] h-[20px] rounded-full inline-flex items-center justify-center border-0 p-0 cursor-pointer bg-[oklch(1_0_0_/_0.1)] text-[oklch(1_0_0_/_0.65)] transition-[background] duration-150 hover:bg-[oklch(1_0_0_/_0.18)]"
                          onClick={copyMessage}
                          aria-label="Copy message"
                        >
                          <Copy className={cn('w-[9px]! h-[9px]!', msgCopied && 'hidden')} strokeWidth={2} aria-hidden />
                          <Check className={cn('w-[9px]! h-[9px]! text-brand', msgCopied ? 'block' : 'hidden')} strokeWidth={2.5} aria-hidden />
                        </button>
                      </div>

                      <div className="flex items-center gap-[6px] [padding:0_6px_4px]">
                        <span className="flex-none w-[20px] h-[20px] rounded-full inline-flex items-center justify-center bg-[oklch(1_0_0_/_0.12)] text-[oklch(1_0_0_/_0.7)]">
                          <ChanIcon
                            className={cn('w-[12px]! h-[12px]!', !msg.direct && 'w-[11px]! h-[11px]!')}
                            strokeWidth={2}
                            aria-hidden
                          />
                        </span>
                        <input
                          ref={inputRef}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onFocus={() => setComposing(true)}
                          onBlur={() => setComposing(false)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing && draft.trim()) {
                              setSent((s) =>
                                [
                                  { name: 'You', text: draft.trim(), direct: msg.direct, circle: msg.circle, color: msg.color },
                                  ...s,
                                ].slice(0, 3),
                              )
                              setDraft('')
                            }
                          }}
                          placeholder={msg.direct ? `Private to ${msg.name}…` : 'Reply to all…'}
                          aria-label="Reply"
                          className="flex-1 min-w-0 px-[8px] py-[5px] rounded-[7px] bg-[oklch(1_0_0_/_0.12)] border-0 outline-none text-[13px] leading-[1.2] text-white placeholder:text-[oklch(1_0_0_/_0.7)]"
                        />
                      </div>

                      <div className="flex flex-col [padding:0_6px_6px]">
                        <div className="h-px bg-[oklch(1_0_0_/_0.15)] mb-[3px]" />
                        {sent.map((s, i) => (
                          <div key={`sent-${sent.length - i}`} className="flex items-center gap-[4px] w-full min-h-[20px] text-left">
                            <span className="flex-none flex items-center gap-[4px]">
                              <span className="flex-none w-[5px] h-[5px] rounded-full" style={{ background: s.color }} />
                              <span className="text-[10px] font-semibold text-[oklch(1_0_0_/_0.5)]">You</span>
                            </span>
                            <span className="flex-[0_1_auto] min-w-0 mr-auto text-[11px] text-[oklch(1_0_0_/_0.55)] whitespace-nowrap overflow-hidden text-ellipsis">{s.text}</span>
                          </div>
                        ))}
                        {history.map((h) => {
                          const RowIcon = h.direct ? LockFill : Globe
                          return (
                            <button
                              key={h.idx}
                              className="group/nxrow flex items-center gap-[4px] w-full min-h-[20px] p-0 border-0 bg-none cursor-pointer text-left"
                              onClick={() => copyRow(h.idx, h.text)}
                            >
                              <span className="flex-none flex items-center gap-[4px]">
                                <span className="flex-none w-[5px] h-[5px] rounded-full" style={{ background: h.color }} />
                                <span className="text-[10px] font-semibold text-[oklch(1_0_0_/_0.5)]">{h.name}</span>
                                <RowIcon
                                  className={cn('flex-none w-[9px]! h-[9px]! text-[oklch(1_0_0_/_0.3)]', !h.direct && 'w-[8px]! h-[8px]!')}
                                  strokeWidth={1.8}
                                  aria-hidden
                                />
                              </span>
                              <span className="flex-[0_1_auto] min-w-0 mr-auto text-[11px] text-[oklch(1_0_0_/_0.55)] whitespace-nowrap overflow-hidden text-ellipsis">{h.text}</span>
                              <span className={cn('flex-none w-[20px] h-[20px] rounded-full inline-flex items-center justify-center bg-[oklch(1_0_0_/_0.1)] text-[oklch(1_0_0_/_0.65)] opacity-0 transition-opacity duration-150 group-hover/nxrow:opacity-100', copiedRow === h.idx && 'opacity-100')}>
                                <Copy className={cn('w-[9px]! h-[9px]!', copiedRow === h.idx && 'hidden')} strokeWidth={2} aria-hidden />
                                <Check className={cn('w-[9px]! h-[9px]! text-brand', copiedRow === h.idx ? 'block' : 'hidden')} strokeWidth={2.5} aria-hidden />
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <div className={cn("absolute top-[72px] left-1/2 [transform:translateX(-50%)] z-[4] pointer-events-none flex flex-col items-center gap-[1px] text-[11px] leading-[1] whitespace-nowrap text-[oklch(1_0_0_/_0.62)] [text-shadow:0_1px_3px_oklch(0_0_0_/_0.6)] opacity-0 [transition:opacity_0.4s_ease] [@media(hover:none)]:hidden motion-reduce:hidden", hintVisible && 'opacity-100')} aria-hidden>
                    <ChevronUp className="w-[13px]! h-[13px]! animate-[hint-bob-up_2s_ease-in-out_infinite] motion-reduce:animate-none" aria-hidden />
                    <span>hover for details</span>
                  </div>
              </motion.div>
            </motion.div>
            </motion.div>
          </motion.div>
          <motion.div className="fixed bottom-[calc(22px+env(safe-area-inset-bottom,0px))] left-1/2 [transform:translateX(-50%)] z-[4] pointer-events-none flex flex-col items-center gap-[2px] text-muted-foreground motion-reduce:hidden" style={reduce ? undefined : { opacity: hintOpacity }}>
            <span className="text-[length:var(--text-xs)]">See it munkel</span>
            <ChevronDown className="w-[20px]! h-[20px]! animate-[hint-bob_2s_ease-in-out_infinite] motion-reduce:animate-none" aria-hidden />
          </motion.div>
        </div>
      </div>
    </header>
  )
}
