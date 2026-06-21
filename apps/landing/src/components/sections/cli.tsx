import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { motion } from 'motion/react'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { sleep } from '@/lib/utils'

type TermStep = { type: 'cmd'; text: string } | { type: 'out'; html: string }

const TERM_SCRIPT: TermStep[] = [
  { type: 'cmd', text: 'munkel blue-table-42 all "table\'s free, come down"' },
  { type: 'out', html: '<span class="tdim">munkeled ✓</span>' },
  { type: 'cmd', text: 'munkel project-7 Sam "package for you downstairs"' },
  { type: 'out', html: '<span class="tdim">munkeled ✓</span>' },
]

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
    <Tabs value={pm} onValueChange={(v) => setPm(v as Pm)} className="install-cmd">
      <div className="install-bar">
        <TabsList className="install-tabs">
          {(Object.keys(INSTALL_CMDS) as Pm[]).map((key) => (
            <TabsTrigger key={key} value={key}>
              {key}
            </TabsTrigger>
          ))}
        </TabsList>
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
    </Tabs>
  )
}

function TerminalDemo({ onFirstSend }: { onFirstSend?: () => void }) {
  const termRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const onFirstSendRef = useRef(onFirstSend)
  onFirstSendRef.current = onFirstSend

  useEffect(() => {
    const term = termRef.current
    const body = bodyRef.current
    if (!term || !body) return

    let started = false
    let cancelled = false
    let sentFired = false
    // Under reduced motion the script renders instantly instead of typing.
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
          if (instant) {
            ttext.textContent = step.text
          } else {
            for (const ch of step.text) {
              if (cancelled) return
              ttext.textContent += ch
              await sleep(28 + Math.random() * 40)
            }
            await sleep(350)
          }
          if (cancelled) return
          line.querySelector('.cursor')?.remove()
        } else {
          line.innerHTML = step.html
          if (!sentFired && step.html.includes('munkeled')) {
            sentFired = true
            onFirstSendRef.current?.()
          }
          if (!instant) await sleep(420)
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

function CliShowcase() {
  const [sent, setSent] = useState(false)
  return (
    <div className="cli-stage">
      <TerminalDemo onFirstSend={() => setSent(true)} />
      <motion.div
        className="meanwhile"
        aria-hidden={!sent}
        initial={{ opacity: 0, y: 6 }}
        animate={sent ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="meanwhile-caption">meanwhile, on Alex's Mac</div>
        <div className="mini-notch">
          <img src="/avatars/03.png" alt="" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="mn-name">Taylor</span>
            <span>table's free, come down</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export function Cli() {
  return (
    <section id="cli">
      <div className="container">
        <div className="cli-grid">
          <div className="cli-copy">
            <div className="section-kicker">CLI</div>
            <h2>Munkel from your terminal.</h2>
            <p>One line sends to a person or a channel. Plain text in, plain text out.</p>
          </div>
          <CliShowcase />
        </div>
        <div className="agents-row">
          <div className="agents-copy">
            <div className="section-kicker">Agents</div>
            <h3>Your agents can munkel too.</h3>
            <p>Anything that runs a shell can send a munkel. Teach yours in one step.</p>
          </div>
          <InstallCmd />
        </div>
      </div>
    </section>
  )
}
