export function HowItWorks() {
  return (
    <section id="how">
      <div className="mx-auto max-w-[1400px] px-8">
        <div className="mb-16 max-[900px]:mb-12 max-w-[640px] mx-auto text-center">
          <div className="font-mono text-[length:var(--text-xs)] text-brand tracking-[0.06em] uppercase">How it works</div>
          <h2 className="text-[length:var(--text-4xl)] font-semibold tracking-tight mt-4 text-balance">Name a channel, start munkeling.</h2>
          <p className="mt-[1.125rem] text-muted-foreground leading-relaxed text-[length:var(--text-lg)] text-pretty">Pick a name, share it, and you're whispering.</p>
        </div>
        <div className="grid grid-cols-3 gap-6 max-[820px]:grid-cols-1 max-[820px]:max-w-[460px] max-[820px]:mx-auto">
          <figure className="m-0">
            <div className="relative aspect-[4/3] rounded-[16px] overflow-hidden border border-border bg-[var(--surface)] shadow-[var(--shadow-lg)]">
              <img
                src="/shots/join.png"
                alt="Munkel menu bar popover: type a channel name to join or create one"
                loading="lazy"
                className="w-full h-full object-cover block absolute inset-0"
              />
              <img src="/shots/join-2.png" alt="" className="w-full h-full object-cover block absolute inset-0 opacity-0 animate-[shotFade_7s_ease-in-out_infinite] motion-reduce:animate-none" loading="lazy" aria-hidden />
            </div>
            <figcaption className="mt-4 text-center text-[length:var(--text-sm)] text-muted-foreground leading-snug">
              <span className="block mb-[0.15rem] text-foreground font-semibold text-[length:var(--text-base)]">Join a channel</span>
              Pick a name, you're in.
            </figcaption>
          </figure>
          <figure className="m-0">
            <div className="relative aspect-[4/3] rounded-[16px] overflow-hidden border border-border bg-[var(--surface)] shadow-[var(--shadow-lg)]">
              <img
                src="/shots/compose.png"
                alt="Munkel floating compose window sending a quick note to a channel"
                loading="lazy"
                className="w-full h-full object-cover block absolute inset-0"
              />
              <img src="/shots/compose-2.png" alt="" className="w-full h-full object-cover block absolute inset-0 opacity-0 animate-[shotFade_7s_ease-in-out_infinite] motion-reduce:animate-none" loading="lazy" aria-hidden />
            </div>
            <figcaption className="mt-4 text-center text-[length:var(--text-sm)] text-muted-foreground leading-snug">
              <span className="block mb-[0.15rem] text-foreground font-semibold text-[length:var(--text-base)]">Whisper a quick note</span>
              A floating box. Send and forget.
            </figcaption>
          </figure>
          <figure className="m-0">
            <div className="relative aspect-[4/3] rounded-[16px] overflow-hidden border border-border bg-[var(--surface)] shadow-[var(--shadow-lg)]">
              <img
                src="/shots/notch.png"
                alt="A munkel in the MacBook notch with the recent replies"
                loading="lazy"
                className="w-full h-full object-cover block absolute inset-0"
              />
              <img src="/shots/notch-2.png" alt="" className="w-full h-full object-cover block absolute inset-0 opacity-0 animate-[shotFade_7s_ease-in-out_infinite] motion-reduce:animate-none" loading="lazy" aria-hidden />
            </div>
            <figcaption className="mt-4 text-center text-[length:var(--text-sm)] text-muted-foreground leading-snug">
              <span className="block mb-[0.15rem] text-foreground font-semibold text-[length:var(--text-base)]">Read it in the notch</span>
              It slides out, then it's gone.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
