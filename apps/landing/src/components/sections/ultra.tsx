export function Ultra() {
  return (
    <section id="ultra">
      <div className="mx-auto max-w-[1400px] px-8 flex flex-col items-center text-center">
        <div className="font-mono text-[length:var(--text-xs)] text-brand tracking-[0.06em] uppercase">
          MacBook Ultra
        </div>
        <h2 className="text-[length:var(--text-4xl)] font-semibold tracking-tight mt-4 text-balance max-w-[720px]">
          Born in the notch. Ready for the Dynamic Island.
        </h2>
        <p className="mt-[1.125rem] text-muted-foreground text-[length:var(--text-lg)] leading-relaxed text-pretty max-w-[620px]">
          Rumor has it the MacBook Ultra swaps the notch for a Dynamic Island. Munkels already live
          in that exact spot, sliding out to say hi and vanishing again. The day such a MacBook
          ships, Munkel is ready. Same note across the table, slightly fancier table.
        </p>
        <div
          className="mt-12 flex items-center gap-[10px] bg-black border border-[oklch(1_0_0_/_0.12)] rounded-full py-2 pr-[20px] pl-3 shadow-[var(--shadow-md)]"
          aria-hidden
        >
          <span className="w-[9px] h-[9px] rounded-full bg-[radial-gradient(circle_at_35%_35%,oklch(0.38_0.05_250),oklch(0.17_0.03_255)_55%,oklch(0.05_0_0)_100%)] shadow-[0_0_0_1.5px_oklch(0.09_0_0)]" />
          <img src="/avatars/01.png" alt="" className="w-[26px] h-[26px] rounded-full object-cover" />
          <div className="flex flex-col leading-[1.25] text-left">
            <span className="font-mono text-[10px] text-brand">Alex</span>
            <span className="text-[12px] text-white">down in 5</span>
          </div>
        </div>
      </div>
    </section>
  )
}
