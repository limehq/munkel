import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowRight,
  Copy,
  EyeOff,
  Ghost,
  KeyRound,
  Lock,
  Sparkles,
  Terminal,
} from 'lucide-react'

export const Route = createFileRoute('/')({ component: LandingPage })

const WHISPERS = [
  { name: 'Anna', text: 'Kaffee, jemand? ☕', hue: 'from-teal-300 to-emerald-400' },
  { name: 'Ben', text: 'rooftop. five minutes.', hue: 'from-sky-300 to-indigo-400' },
  { name: 'Mia', text: 'psst — look behind you', hue: 'from-rose-300 to-orange-300' },
]

function NotchDemo() {
  const [idx, setIdx] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const show = () => {
      if (cancelled) return
      setIdx(i % WHISPERS.length)
      setOpen(true)
      timer = setTimeout(hide, 3400)
    }
    const hide = () => {
      if (cancelled) return
      setOpen(false)
      i += 1
      timer = setTimeout(show, 1200)
    }
    timer = setTimeout(show, 900)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  const whisper = WHISPERS[idx]

  return (
    <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2">
      <div
        className={`flex items-end justify-center overflow-hidden bg-black shadow-[0_18px_50px_rgba(0,0,0,0.55)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open
            ? 'h-[74px] w-[330px] rounded-b-3xl'
            : 'h-[26px] w-[150px] rounded-b-xl'
        }`}
      >
        <div
          className={`flex w-[330px] items-center gap-3 px-5 pb-3.5 transition-opacity duration-300 ${
            open ? 'opacity-100 delay-200' : 'opacity-0'
          }`}
        >
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${whisper.hue} text-sm font-bold text-black/75`}
          >
            {whisper.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
              {whisper.name}
            </p>
            <p className="truncate text-sm font-medium text-white">
              {whisper.text}
            </p>
          </div>
          <Copy className="h-4 w-4 shrink-0 text-white/35" aria-hidden />
        </div>
      </div>
    </div>
  )
}

function MacScreen() {
  return (
    <div className="relative mx-auto mt-16 w-full max-w-3xl">
      <div className="pointer-events-none absolute -inset-x-12 -top-16 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(111,214,195,0.12),transparent_70%)]" />
      <div className="relative overflow-hidden rounded-[20px] border border-white/10 shadow-[0_50px_140px_-30px_rgba(0,0,0,0.9)]">
        <div className="relative aspect-[16/10] w-full bg-[radial-gradient(120%_90%_at_75%_115%,#16333a_0%,transparent_60%),radial-gradient(90%_70%_at_12%_-10%,#241f3a_0%,transparent_55%),linear-gradient(180deg,#0d1217,#0a0d11)]">
          {/* menu bar */}
          <div className="flex h-7 items-center justify-between px-4 text-[11px] font-medium text-white/50">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-white/75">Munkel2</span>
              <span className="hidden sm:inline">Group</span>
              <span className="hidden sm:inline">Help</span>
            </div>
            <span>Wed 9:41</span>
          </div>

          <NotchDemo />

          {/* faint terminal window hinting at the CLI */}
          <div className="absolute bottom-6 left-6 hidden w-72 rounded-lg border border-white/10 bg-black/55 backdrop-blur-sm sm:block">
            <div className="flex items-center gap-1.5 border-b border-white/5 px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-[#ff5f57]/80" />
              <span className="h-2 w-2 rounded-full bg-[#febc2e]/80" />
              <span className="h-2 w-2 rounded-full bg-[#28c840]/80" />
            </div>
            <p className="px-3 py-2.5 font-mono text-[11px] text-white/55">
              <span className="text-accent/80">$</span> munkel yolbe all{' '}
              <span className="text-white/75">&quot;Kaffee, jemand?&quot;</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const FEATURES = [
  {
    icon: Ghost,
    title: 'Ephemeral by design',
    body: 'Messages exist only in the moment they arrive. The relay stores nothing — friends who are offline simply miss the whisper, like in real life.',
  },
  {
    icon: Lock,
    title: 'End-to-end encrypted',
    body: 'AES-256-GCM with keys derived on your devices. The relay routes opaque blobs and cannot read a single word.',
  },
  {
    icon: KeyRound,
    title: 'No accounts',
    body: 'A human-readable group code is the only credential. No sign-up, no phone number, no directory of who talks to whom.',
  },
  {
    icon: EyeOff,
    title: 'Invisible in screen sharing',
    body: 'Every surface showing a message is excluded from screen capture. Your Zoom or Teams audience sees nothing — only the physical display does.',
  },
  {
    icon: Sparkles,
    title: 'Native to the notch',
    body: 'Built in SwiftUI. Messages glide out of the MacBook notch with haptic hover and one-click copy. Macs without a notch get a floating panel.',
  },
  {
    icon: Terminal,
    title: 'Scriptable',
    body: 'The munkel CLI sends whispers straight from your terminal — and an MCP server is on the way, so even your agent can munkel.',
  },
]

function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-[radial-gradient(70%_60%_at_50%_-10%,rgba(111,214,195,0.08),transparent_70%)]" />

      {/* header */}
      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-5 w-10 items-end justify-center rounded-b-lg bg-white/90 pb-1">
            <span className="h-1 w-1 rounded-full bg-night" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Munkel</span>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-ink-dim">
          macOS · 2026
        </span>
      </header>

      {/* hero */}
      <section className="relative mx-auto w-full max-w-5xl px-6 pt-14 text-center sm:pt-20">
        <p className="mx-auto mb-6 w-fit rounded-full border border-accent/20 bg-accent/10 px-4 py-1.5 text-xs font-medium tracking-wide text-accent">
          munkeln <span className="text-accent/60">(German, v.)</span> — to
          whisper in secret
        </p>
        <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-[1.04] tracking-tight sm:text-7xl">
          Whispers from the&nbsp;notch.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-ink-dim sm:text-lg">
          Munkel is ephemeral messaging for macOS: end-to-end encrypted notes
          from your favorite people, sliding elegantly out of the MacBook notch
          — and gone moments later. No accounts. No history. No trace.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#how"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-night transition hover:brightness-110"
          >
            See how it works
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-ink-dim">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            In development — coming to macOS
          </span>
        </div>

        <MacScreen />
      </section>

      {/* how it works */}
      <section id="how" className="relative mx-auto w-full max-w-5xl scroll-mt-16 px-6 pt-28 sm:pt-36">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          One code is everything.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-ink-dim">
          A group is born from a shared, human-readable code. The code is the
          room <em>and</em> the key — it never touches a server.
        </p>

        <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
          <code className="rounded-xl border border-accent/30 bg-accent/10 px-5 py-3 font-mono text-base font-semibold text-accent">
            kaffee-falke-42
          </code>
          <div className="flex flex-col items-center text-ink-dim">
            <ArrowRight className="hidden h-5 w-5 sm:block" aria-hidden />
            <span className="mt-1 font-mono text-[11px] tracking-wide">
              HKDF-SHA256
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <code className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs text-ink-dim">
              group id
            </code>
            <code className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs text-ink-dim">
              AES-256-GCM key
            </code>
          </div>
        </div>

        <div className="mx-auto mt-14 grid max-w-3xl gap-8 text-center sm:grid-cols-3">
          {[
            ['Make up a code', 'Anything memorable. The sillier, the better.'],
            ['Tell your friends', 'Over coffee, ideally — not over the internet.'],
            ['Whisper away', 'Everyone who knows the code is in. Forget the code, and the group never existed.'],
          ].map(([title, body], i) => (
            <div key={title}>
              <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 font-mono text-sm text-accent">
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-ink-dim">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* features */}
      <section className="relative mx-auto w-full max-w-5xl px-6 pt-28 sm:pt-36">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Built to forget.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-ink-dim">
          Every architectural decision serves the same goal: your conversations
          exist only in the moment — and only on your screens.
        </p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/8 bg-panel/70 p-6 transition hover:border-white/15"
            >
              <Icon className="h-5 w-5 text-accent" aria-hidden />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-dim">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* closing */}
      <section className="relative mx-auto w-full max-w-3xl px-6 pb-10 pt-28 text-center sm:pt-36">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Rumor has it, it&apos;s almost ready.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-ink-dim">
          Munkel is in active development and coming to macOS soon. Until then:
          lean over, cover your mouth, and whisper the old-fashioned way.
        </p>
      </section>

      {/* footer */}
      <footer className="relative border-t border-white/5">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-ink-dim sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-3.5 w-7 items-end justify-center rounded-b-md bg-white/80 pb-0.5">
              <span className="h-0.5 w-0.5 rounded-full bg-night" />
            </span>
            <span className="font-medium text-ink">Munkel</span>
            <span>· ephemeral messages for macOS</span>
          </div>
          <p>No analytics, no cookies — obviously.</p>
        </div>
      </footer>
    </main>
  )
}
