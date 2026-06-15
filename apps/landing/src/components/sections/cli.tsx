import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

import { sleep } from '@/lib/utils'

type TermStep = { type: 'cmd'; text: string } | { type: 'out'; html: string }

// Mirrors the real CLI output (apps/cli/src/munkel.ts): circles print as
// `● code  —  members`, every successful send prints `munkeled ✓`.
const TERM_SCRIPT: TermStep[] = [
  { type: 'cmd', text: 'munkel circles' },
  {
    type: 'out',
    html: '<span class="tdot-live">●</span> blue-table-42  <span class="tdim">—</span>  Alex, Sam, Morgan',
  },
  {
    type: 'out',
    html: '<span class="tdot-live">●</span> project-7  <span class="tdim">—</span>  Sam, Alex',
  },
  { type: 'cmd', text: 'munkel blue-table-42 all "table\'s free, come down"' },
  { type: 'out', html: '<span class="tdim">munkeled ✓</span>' },
  { type: 'cmd', text: 'munkel project-7 Sam "package for you downstairs"' },
  { type: 'out', html: '<span class="tdim">munkeled ✓</span>' },
]

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

/** CLI: copy + a typed terminal demo that lands a munkel in a receiving notch. */
export function Cli() {
  return (
    <section id="cli">
      <div className="container">
        <div className="cli-grid">
          <div className="cli-copy">
            <div className="section-kicker">CLI</div>
            <h2>Munkel from the shell.</h2>
            <p>
              <span className="code">munkel</span> is a thin client over the app's Unix domain
              socket. The app owns all crypto and relay connections, the CLI just talks. Recipients
              by display name, circles by code prefix.
            </p>
            <p>
              Newline-delimited JSON over <span className="code">control.sock</span> makes it an
              ideal substrate for scripts and agents.
            </p>
          </div>
          <CliShowcase />
        </div>
      </div>
    </section>
  )
}
