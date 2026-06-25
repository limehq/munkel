import { useEffect, useRef } from 'react'

import { sleep } from '@/lib/utils'

type TermStep = { type: 'cmd'; text: string } | { type: 'out'; html: string }

const TERM_SCRIPT: TermStep[] = [
  { type: 'cmd', text: 'munkel channels' },
  {
    type: 'out',
    html: '<span class="text-brand">●</span> blue-table-42  <span class="text-[oklch(0.6_0_0)]">·</span>  Alex, Sam, Morgan',
  },
  {
    type: 'out',
    html: '<span class="text-brand">●</span> project-7  <span class="text-[oklch(0.6_0_0)]">·</span>  Sam, Alex',
  },
  { type: 'cmd', text: 'munkel blue-table-42 all "table\'s free, come down"' },
  { type: 'out', html: '<span class="text-[oklch(0.6_0_0)]">munkeled ✓</span>' },
  { type: 'cmd', text: 'munkel project-7 Sam "package for you downstairs"' },
  { type: 'out', html: '<span class="text-[oklch(0.6_0_0)]">munkeled ✓</span>' },
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
        line.className = 'whitespace-pre-wrap'
        body!.appendChild(line)
        if (step.type === 'cmd') {
          line.innerHTML =
            '<span class="text-brand [text-shadow:0_0_calc(var(--glow)*12px)_color-mix(in_oklab,var(--brand)_60%,transparent)]">$ </span><span class="ttext"></span><span class="cursor inline-block w-[7px] h-[14px] bg-[oklch(0.85_0_0)] align-[-2px] animate-[blink_1s_steps(1)_infinite]"></span>'
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
      done.className = 'whitespace-pre-wrap'
      done.innerHTML =
        '<span class="text-brand [text-shadow:0_0_calc(var(--glow)*12px)_color-mix(in_oklab,var(--brand)_60%,transparent)]">$ </span><span class="cursor inline-block w-[7px] h-[14px] bg-[oklch(0.85_0_0)] align-[-2px] animate-[blink_1s_steps(1)_infinite]"></span>'
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
    <div
      className="border border-border rounded-[var(--radius-xl)] bg-[oklch(0.17_0_0)] [html:not(.dark)_&]:bg-[oklch(0.205_0_0)] overflow-hidden shadow-[var(--shadow-lg)]"
      ref={termRef}
    >
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-b-[oklch(1_0_0_/_0.08)]">
        <span className="w-[11px] h-[11px] rounded-full bg-[oklch(1_0_0_/_0.14)]"></span>
        <span className="w-[11px] h-[11px] rounded-full bg-[oklch(1_0_0_/_0.14)]"></span>
        <span className="w-[11px] h-[11px] rounded-full bg-[oklch(1_0_0_/_0.14)]"></span>
        <span className="ml-auto mr-auto font-mono text-[11px] text-[oklch(0.6_0_0)] translate-x-[-24px]">
          zsh · munkel
        </span>
      </div>
      <div
        className="p-5 pb-6 font-mono text-[13px] leading-[1.9] text-[oklch(0.85_0_0)] min-h-[242px]"
        ref={bodyRef}
      >
        <span className="cursor inline-block w-[7px] h-[14px] bg-[oklch(0.85_0_0)] align-[-2px] animate-[blink_1s_steps(1)_infinite]"></span>
      </div>
    </div>
  )
}

function CliShowcase() {
  return (
    <div className="min-w-0">
      <TerminalDemo />
    </div>
  )
}

export function Cli() {
  return (
    <section id="cli">
      <div className="mx-auto max-w-[1400px] px-8">
        <div className="grid grid-cols-[5fr_7fr] gap-12 items-start max-[900px]:grid-cols-1">
          <div>
            <div className="font-mono text-[length:var(--text-xs)] text-brand tracking-[0.06em] uppercase">
              CLI
            </div>
            <h2 className="text-[length:var(--text-4xl)] font-semibold tracking-tight mt-4">
              Munkel from the shell.
            </h2>
            <p className="mt-[1.125rem] text-muted-foreground leading-relaxed text-[length:var(--text-lg)] text-pretty">
              <span className="font-mono text-[0.875em] bg-muted px-1.5 py-0.5 rounded-[calc(var(--radius)*0.6)] text-[0.8125rem]!">
                munkel
              </span>{' '}
              is a thin client that talks to
              the app over a local socket. The app handles the crypto and the connection, the CLI
              just sends.
            </p>
          </div>
          <CliShowcase />
        </div>
      </div>
    </section>
  )
}
