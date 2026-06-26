import { Laptop, Lock, Terminal, TimerOff, UserRoundX } from 'lucide-react'

export function Features() {
  return (
    <section id="features">
      <div className="mx-auto max-w-[1400px] px-8">
        <div className="max-w-[620px] mb-16 max-[900px]:mb-12">
          <div className="font-mono text-[length:var(--text-xs)] text-brand tracking-[0.06em] uppercase">Features</div>
          <h2 className="text-[length:var(--text-4xl)] font-semibold tracking-tight mt-4 text-balance">Small surface. Sharp edges.</h2>
          <p className="mt-[1.125rem] text-muted-foreground leading-relaxed text-[length:var(--text-lg)] text-pretty">Everything it does, and the things it refuses to.</p>
        </div>
        <div className="grid grid-cols-4 [grid-auto-rows:minmax(190px,auto)] gap-5 max-[900px]:grid-cols-1 max-[900px]:[grid-auto-rows:auto]">
          <div className="flex flex-col border border-border rounded-[var(--radius-xl)] bg-card transition-[border-color] duration-150 hover:border-ring col-start-1 col-end-3 row-start-1 row-end-3 max-[900px]:col-auto! max-[900px]:row-auto! p-10 max-[900px]:p-6 relative overflow-hidden before:content-[''] before:absolute before:inset-0 before:pointer-events-none before:bg-[radial-gradient(130%_90%_at_100%_0%,var(--brand-soft),transparent_58%)] [&>*]:relative">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] bg-[var(--brand-soft)] text-brand shadow-[0_0_calc(var(--glow)*20px)_color-mix(in_oklab,var(--brand)_20%,transparent)] mb-4 [&_svg]:w-[18px]! [&_svg]:h-[18px]!">
              <TimerOff aria-hidden />
            </div>
            <h3 className="text-[length:var(--text-xl)] font-semibold">Say it, then let it go</h3>
            <p className="mt-2 text-[length:var(--text-sm)] text-muted-foreground leading-relaxed text-pretty max-w-[46ch]">
              Be quick and candid — your munkels live only in the moment, nothing logged or stored.
              There's nothing to delete and nothing that comes back later. Miss one and it's gone,
              like a real whisper.
            </p>
            <div className="mt-auto pt-6">
              <div className="relative h-[108px]">
                <div className="absolute bottom-0 left-1/2 flex items-center gap-2 bg-black border border-[oklch(1_0_0_/_0.12)] rounded-[5px_5px_16px_16px] py-[7px] pr-[14px] pl-2 whitespace-nowrap [transform:translateX(-50%)_translateY(-52px)_scale(0.9)] opacity-10" aria-hidden>
                  <img src="/avatars/02.png" alt="" className="w-5 h-5 rounded-full object-cover" />
                  <span className="text-[12px] font-semibold text-white">on my way</span>
                </div>
                <div className="absolute bottom-0 left-1/2 flex items-center gap-2 bg-black border border-[oklch(1_0_0_/_0.12)] rounded-[5px_5px_16px_16px] py-[7px] pr-[14px] pl-2 whitespace-nowrap [transform:translateX(-50%)_translateY(-28px)_scale(0.95)] opacity-30" aria-hidden>
                  <img src="/avatars/05.png" alt="" className="w-5 h-5 rounded-full object-cover" />
                  <span className="text-[12px] font-semibold text-white">same table</span>
                </div>
                <div className="absolute bottom-0 left-1/2 flex items-center gap-2 bg-black border border-[oklch(1_0_0_/_0.12)] rounded-[5px_5px_16px_16px] py-[7px] pr-[14px] pl-2 whitespace-nowrap [transform:translateX(-50%)]">
                  <img src="/avatars/01.png" alt="" className="w-5 h-5 rounded-full object-cover" />
                  <span className="text-[12px] font-semibold text-white">down in 5</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col border border-border rounded-[var(--radius-xl)] bg-card p-7 transition-[border-color] duration-150 hover:border-ring col-start-3 col-end-5 row-start-1 row-end-2 max-[900px]:col-auto! max-[900px]:row-auto!">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] bg-[var(--brand-soft)] text-brand shadow-[0_0_calc(var(--glow)*20px)_color-mix(in_oklab,var(--brand)_20%,transparent)] mb-4 [&_svg]:w-[18px]! [&_svg]:h-[18px]!">
              <Lock aria-hidden />
            </div>
            <h3 className="text-[length:var(--text-base)] font-semibold">Only your people can read it</h3>
            <p className="mt-2 text-[length:var(--text-sm)] text-muted-foreground leading-relaxed text-pretty max-w-[46ch]">
              Your munkels are for the channel and no one else — not even us. They're sealed on your
              Mac with the channel name as the key; our relay only ever sees envelopes it can't open.
            </p>
            <div className="mt-auto pt-5 flex items-center gap-2 flex-wrap font-mono text-[length:var(--text-xs)]" aria-hidden>
              <span className="py-[0.3rem] px-[0.55rem] border border-border rounded-[var(--radius-sm)] bg-[var(--surface)] text-muted-foreground">a9f2·c41</span>
              <span className="text-border">→</span>
              <span className="py-[0.3rem] px-[0.55rem] border border-border rounded-[var(--radius-sm)] bg-[var(--surface)] text-muted-foreground">7e0d·1bb</span>
              <span className="text-border">→</span>
              <span className="py-[0.3rem] px-[0.55rem] border border-border rounded-[var(--radius-sm)] bg-[var(--surface)] text-muted-foreground">f30c·e8a</span>
              <span className="text-border">→</span>
              <span className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-[var(--radius-md)] bg-[var(--brand-soft)] text-brand [&_svg]:w-[15px]! [&_svg]:h-[15px]!">
                <Lock strokeWidth={1.8} aria-hidden />
              </span>
            </div>
          </div>
          <div className="flex flex-col border border-border rounded-[var(--radius-xl)] bg-card p-7 transition-[border-color] duration-150 hover:border-ring col-start-3 col-end-5 row-start-2 row-end-3 max-[900px]:col-auto! max-[900px]:row-auto!">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] bg-[var(--brand-soft)] text-brand shadow-[0_0_calc(var(--glow)*20px)_color-mix(in_oklab,var(--brand)_20%,transparent)] mb-4 [&_svg]:w-[18px]! [&_svg]:h-[18px]!">
              <UserRoundX aria-hidden />
            </div>
            <h3 className="text-[length:var(--text-base)] font-semibold">Nothing to sign up for</h3>
            <p className="mt-2 text-[length:var(--text-sm)] text-muted-foreground leading-relaxed text-pretty max-w-[46ch]">No email, no phone, no password — nothing to create and nothing to leak. Munkel keeps no accounts and stores nothing about you. Sign in with GitHub once, just for your name and face; the token is never stored.</p>
          </div>
          <div className="flex flex-col border border-border rounded-[var(--radius-xl)] bg-card p-7 transition-[border-color] duration-150 hover:border-ring col-start-1 col-end-3 row-start-3 row-end-4 max-[900px]:col-auto! max-[900px]:row-auto!">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] bg-[var(--brand-soft)] text-brand shadow-[0_0_calc(var(--glow)*20px)_color-mix(in_oklab,var(--brand)_20%,transparent)] mb-4 [&_svg]:w-[18px]! [&_svg]:h-[18px]!">
              <Terminal aria-hidden />
            </div>
            <h3 className="text-[length:var(--text-base)] font-semibold">Send from wherever you work</h3>
            <p className="mt-2 text-[length:var(--text-sm)] text-muted-foreground leading-relaxed text-pretty max-w-[46ch]">
              Fire a munkel straight from your shell, script it into a workflow, or hand it to an
              agent. An MCP server is on the way.
            </p>
            <div className="mt-auto pt-5" aria-hidden>
              <div className="font-mono text-[length:var(--text-xs)] text-[oklch(0.92_0_0)] bg-[oklch(0.17_0_0)] border border-border rounded-[var(--radius-md)] py-[0.625rem] px-[0.875rem] whitespace-nowrap overflow-hidden text-ellipsis">
                <span className="text-brand">$ </span>munkel blue-table-42 all "omw"
              </div>
              <div className="font-mono text-[length:var(--text-xs)] text-muted-foreground mt-2 pl-1">munkeled ✓</div>
            </div>
          </div>
          <div className="flex flex-col border border-border rounded-[var(--radius-xl)] bg-card p-7 transition-[border-color] duration-150 hover:border-ring col-start-3 col-end-5 row-start-3 row-end-4 max-[900px]:col-auto! max-[900px]:row-auto!">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] bg-[var(--brand-soft)] text-brand shadow-[0_0_calc(var(--glow)*20px)_color-mix(in_oklab,var(--brand)_20%,transparent)] mb-4 [&_svg]:w-[18px]! [&_svg]:h-[18px]!">
              <Laptop aria-hidden />
            </div>
            <h3 className="text-[length:var(--text-base)] font-semibold">Works on any Mac</h3>
            <p className="mt-2 text-[length:var(--text-sm)] text-muted-foreground leading-relaxed text-pretty max-w-[46ch]">
              No notch? No problem. Munkels slide into a tidy floating panel instead — same munkel,
              different spot.
            </p>
            <div className="mt-auto pt-5 flex justify-center" aria-hidden>
              <div className="flex items-center gap-[10px] bg-[color-mix(in_oklab,var(--background)_64%,#000)] border border-[oklch(1_0_0_/_0.12)] rounded-full py-2 pr-[18px] pl-2 shadow-[var(--shadow-md)]">
                <img src="/avatars/03.png" alt="" className="w-[26px] h-[26px] rounded-full object-cover" />
                <div className="flex flex-col leading-[1.25]">
                  <span className="font-mono text-[10px] text-brand">Taylor</span>
                  <span className="text-[12px] text-foreground">table's free, come down</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
