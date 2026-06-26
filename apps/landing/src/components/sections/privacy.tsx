import { Globe, Mic, MonitorOff, Video } from 'lucide-react'

import { cn } from '@/lib/utils'

import { Avatar, MacScreen } from './mac-screen'

const CALL = ['Mara', 'Tom', 'Lena']

// The window being shared — same on both screens (a stand-in slide/dashboard).
function SharedWindow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'absolute top-[42px] left-[9%] right-[9%] bottom-[56px] flex flex-col overflow-hidden rounded-[10px] border border-[oklch(1_0_0_/_0.12)] shadow-[0_18px_44px_-14px_oklch(0_0_0_/_0.55)]',
        className,
      )}
    >
      <div className="flex-none h-[24px] flex items-center gap-[6px] px-[10px] bg-[oklch(0.24_0.008_260)] border-b border-b-[oklch(1_0_0_/_0.08)]">
        <span className="w-[8px] h-[8px] rounded-full bg-[#ff5f57]" />
        <span className="w-[8px] h-[8px] rounded-full bg-[#febc2e]" />
        <span className="w-[8px] h-[8px] rounded-full bg-[#28c840]" />
        <span className="ml-[4px] text-[9px] text-[oklch(1_0_0_/_0.55)]">Q3 roadmap</span>
      </div>
      <div className="flex-1 flex flex-col gap-[14px] py-[18px] px-[22px] bg-[oklch(0.17_0.008_260)]">
        <div className="h-[13px] w-[46%] rounded-[4px] [background:linear-gradient(90deg,var(--brand),color-mix(in_oklab,var(--brand)_50%,#e0556b))]" />
        <div className="flex-1 flex items-end gap-[10px]">
          <span className="flex-1 rounded-t-[4px] bg-[oklch(0.5_0.06_255)]" style={{ height: '42%' }} />
          <span className="flex-1 rounded-t-[4px] bg-[color-mix(in_oklab,var(--brand)_60%,oklch(0.5_0.06_255))]" style={{ height: '70%' }} />
          <span className="flex-1 rounded-t-[4px] bg-[oklch(0.5_0.06_255)]" style={{ height: '54%' }} />
          <span className="flex-1 rounded-t-[4px] bg-[color-mix(in_oklab,var(--brand)_60%,oklch(0.5_0.06_255))]" style={{ height: '88%' }} />
          <span className="flex-1 rounded-t-[4px] bg-[oklch(0.5_0.06_255)]" style={{ height: '63%' }} />
        </div>
      </div>
    </div>
  )
}

// The people on the call — a floating tile strip, visible on both screens.
function CallPeople() {
  return (
    <div className="absolute top-[44px] right-[16px] max-[600px]:top-[30px] max-[600px]:right-[10px] flex gap-[6px] max-[600px]:gap-[4px] p-[6px] max-[600px]:p-[4px] rounded-[12px] border border-[oklch(1_0_0_/_0.12)] bg-[oklch(0.14_0.01_260_/_0.85)] backdrop-blur-[6px]">
      {CALL.map((n) => (
        <div key={n} className="flex flex-col items-center gap-[3px]">
          <Avatar
            name={n}
            className="w-[34px] h-[30px] max-[600px]:w-[24px] max-[600px]:h-[21px] rounded-[7px] flex items-center justify-center [font-family:ui-rounded,system-ui,sans-serif] font-bold text-[12px] max-[600px]:text-[9px] text-white"
          />
          <span className="text-[8px] max-[600px]:text-[6px] text-[oklch(1_0_0_/_0.65)]">{n}</span>
        </div>
      ))}
    </div>
  )
}

// The share controls — a local overlay only the sharer sees, never captured.
function ShareBar() {
  return (
    <div className="absolute bottom-[16px] left-1/2 -translate-x-1/2 flex items-center gap-[9px] pt-[6px] pr-[8px] pb-[6px] pl-[12px] rounded-full border border-[oklch(1_0_0_/_0.12)] bg-[oklch(0.16_0.01_260_/_0.92)] backdrop-blur-[8px] shadow-[0_10px_24px_oklch(0_0_0_/_0.45)] text-[10px] text-[oklch(1_0_0_/_0.9)] whitespace-nowrap">
      <span className="w-[8px] h-[8px] rounded-full bg-[#ff453a] shadow-[0_0_0_3px_rgb(255_69_58_/_0.25)]" />
      <span>Sharing your screen</span>
      <span className="w-px h-[14px] bg-[oklch(1_0_0_/_0.18)]" />
      <Mic className="text-[oklch(1_0_0_/_0.8)]" strokeWidth={2} aria-hidden />
      <Video className="text-[oklch(1_0_0_/_0.8)]" strokeWidth={2} aria-hidden />
      <span className="py-[2px] px-[9px] rounded-full bg-[#c7362d] text-white font-semibold">Stop</span>
    </div>
  )
}

export function Privacy() {
  return (
    <section id="privacy">
      <div className="mx-auto max-w-[1400px] px-8">
        <div className="max-w-[620px] mb-16 max-[900px]:mb-12">
          <div className="font-mono text-[length:var(--text-xs)] text-brand tracking-[0.06em] uppercase">
            Privacy
          </div>
          <h2 className="text-[length:var(--text-4xl)] font-semibold tracking-tight mt-4 text-balance">
            Quiet, even on a shared screen.
          </h2>
          <p className="mt-[1.125rem] text-muted-foreground leading-relaxed text-[length:var(--text-lg)] text-pretty">
            Munkel keeps your notes to yourself, even mid-presentation.
          </p>
        </div>
        <div className="mb-4 flex flex-col gap-5 rounded-[var(--radius-xl)] border border-border bg-card p-6">
          <div className="flex items-start gap-5">
            <div className="inline-flex items-center justify-center w-[36px] h-[36px] rounded-[var(--radius-md)] bg-[var(--brand-soft)] text-brand shadow-[0_0_calc(var(--glow)*20px)_color-mix(in_oklab,var(--brand)_20%,transparent)] mb-0! shrink-0">
              <MonitorOff className="w-[18px]! h-[18px]!" aria-hidden />
            </div>
            <div>
              <h3 className="text-[length:var(--text-base)] font-semibold">
                Invisible to screen sharing
              </h3>
              <p className="mt-1.5 max-w-[70ch] text-[length:var(--text-sm)] leading-relaxed text-muted-foreground text-pretty">
                Sharing your screen on a call? Your munkels stay on yours and out of what everyone
                else sees.
              </p>
            </div>
          </div>
          <div
            className="grid grid-cols-2 items-start gap-7 max-[900px]:grid-cols-1"
            aria-hidden
          >
            <figure className="m-0">
              <MacScreen className="max-w-none w-full">
                <SharedWindow />
                <CallPeople />
                <ShareBar />
                <div className="absolute top-[7px] left-1/2 bg-black z-[5] w-[310px] h-[58px] cursor-pointer [clip-path:path('M0_0_Q15_0_15_15_L15_38_Q15_58_35_58_L275_58_Q295_58_295_38_L295_15_Q295_0_310_0_Z')] [filter:drop-shadow(0_10px_16px_oklch(0_0_0_/_0.5))] [transform:translateX(-50%)_scale(0.66)] [transform-origin:top_center] [transition:width_0.42s_cubic-bezier(0.33,1,0.68,1),height_0.42s_cubic-bezier(0.33,1,0.68,1),clip-path_0.42s_cubic-bezier(0.33,1,0.68,1),filter_0.3s_ease] motion-reduce:[transition:none]">
                  <span className="absolute top-[11px] left-1/2 -translate-x-1/2 w-[7px] h-[7px] z-[3] rounded-full [background:radial-gradient(circle_at_35%_35%,oklch(0.38_0.05_250),oklch(0.17_0.03_255)_55%,oklch(0.05_0_0)_100%)] shadow-[0_0_0_1.5px_oklch(0.09_0_0),inset_0_0_2px_oklch(0.6_0.08_250_/_0.5)]"></span>
                  <div className="absolute inset-0 overflow-hidden rounded-b-[20px] opacity-100 visible [font-family:system-ui,-apple-system,sans-serif] [-webkit-font-smoothing:antialiased]">
                    <Avatar
                      name="Alex"
                      className="absolute top-[6px] left-[30px] w-[20px] h-[20px] rounded-full flex items-center justify-center [font-family:ui-rounded,system-ui,sans-serif] font-bold text-[7.6px] leading-[1] text-white"
                    />
                    <div className="absolute top-[34px] left-[30px] right-[30px] flex items-center gap-[5px]">
                      <Globe
                        className="flex-none w-[9.5px]! h-[9.5px]! text-[oklch(1_0_0_/_0.55)]"
                        strokeWidth={1.8}
                        aria-hidden
                      />
                      <span className="flex-[0_1_auto] min-w-0 [font-family:ui-rounded,system-ui,sans-serif] text-[12px] font-medium leading-[1.2] text-[oklch(1_0_0_/_0.85)] whitespace-nowrap overflow-hidden text-ellipsis">
                        down in 5
                      </span>
                    </div>
                  </div>
                </div>
              </MacScreen>
              <figcaption className="mt-[0.9rem] text-center font-mono text-[length:var(--text-xs)] text-muted-foreground">
                Your screen
              </figcaption>
            </figure>
            <figure className="m-0">
              <MacScreen
                className="max-w-none w-full"
                wallpaperClassName="[background:radial-gradient(70%_55%_at_50%_0%,oklch(0.4_0.13_300),transparent_80%),radial-gradient(55%_50%_at_82%_82%,oklch(0.36_0.11_190),transparent_72%),linear-gradient(180deg,oklch(0.17_0.035_300),oklch(0.12_0.02_280))]"
              >
                <div className="absolute [inset:38px_6%_6%] max-[600px]:[inset:24px_6%_6%] flex flex-row gap-[10px] max-[600px]:gap-[7px] p-[10px] max-[600px]:p-[7px] rounded-[12px] border border-[oklch(1_0_0_/_0.1)] bg-[oklch(0.12_0.01_270_/_0.94)] shadow-[0_22px_54px_-18px_oklch(0_0_0_/_0.6)]">
                  <div className="flex-1 relative overflow-hidden rounded-[8px] border border-[oklch(1_0_0_/_0.08)] [background:radial-gradient(70%_55%_at_50%_0%,color-mix(in_oklab,var(--brand)_32%,oklch(0.15_0.01_250)),transparent_80%),linear-gradient(180deg,oklch(0.14_0.008_250),oklch(0.1_0.005_260))]">
                    <div className="absolute top-0 left-0 right-0 h-[15px] flex items-center px-[7px] bg-[oklch(0_0_0_/_0.3)]">
                      <span className="w-[5px] h-[5px] rounded-full bg-[oklch(1_0_0_/_0.5)]" />
                    </div>
                    <SharedWindow className="top-[26px] left-[8%] right-[8%] bottom-[12%] shadow-[0_10px_24px_-10px_oklch(0_0_0_/_0.5)]" />
                  </div>
                  <div className="flex-none flex flex-col gap-[8px] max-[600px]:gap-[3px] justify-center">
                    {CALL.map((n) => (
                      <div key={n} className="w-[92px] max-[600px]:w-[44px] flex flex-col items-center gap-[3px] max-[600px]:gap-[2px]">
                        <Avatar
                          name={n}
                          className="w-full h-[48px] max-[600px]:h-[20px] rounded-[8px] flex items-center justify-center [font-family:ui-rounded,system-ui,sans-serif] font-bold text-[16px] max-[600px]:text-[9px] text-white"
                        />
                        <span className="text-[9px] max-[600px]:text-[6px] text-[oklch(1_0_0_/_0.7)]">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </MacScreen>
              <figcaption className="mt-[0.9rem] text-center font-mono text-[length:var(--text-xs)] text-muted-foreground">
                What everyone else sees
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  )
}
