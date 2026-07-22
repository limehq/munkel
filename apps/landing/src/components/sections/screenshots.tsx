import { useRef, useState } from 'react'
import { Globe } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Avatar, MacScreen } from './mac-screen'

// Placeholder album "images" — gradient tiles for now. Swap each `grad` for a
// real url(/shots/...) once we have product images.
type Shot = { id: string; grad: string }
const ALBUM: Shot[] = [
  { id: 'a1', grad: 'linear-gradient(135deg, #6aa0ff, #3857eb)' },
  { id: 'a2', grad: 'linear-gradient(135deg, #f6a44f, #eb6b2e)' },
  { id: 'a3', grad: 'linear-gradient(135deg, #bf85fa, #7a40e0)' },
]
const HIST_ALBUM: Shot[] = [
  { id: 'h1', grad: 'linear-gradient(135deg, #66d99e, #1a9475)' },
  { id: 'h2', grad: 'linear-gradient(135deg, #57d6db, #2980b8)' },
]

/**
 * A still (non-scroll) MacBook display showing the notch already expanded with
 * an image album. Hovering any thumbnail pops the picture full-screen on the
 * display, mirroring the app's Quick Look hover.
 */
export function Screenshots() {
  const [preview, setPreview] = useState<Shot | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const show = (img: Shot) => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setPreview(img)
  }
  const hide = () => {
    hideTimer.current = setTimeout(() => setPreview(null), 140)
  }

  return (
    <section id="screenshots" className="overflow-x-clip">
      <div className="mx-auto max-w-[1400px] px-8">
        <div className="mb-16 max-[900px]:mb-12 max-w-[640px] mx-auto text-center">
          <div className="font-mono text-[length:var(--text-xs)] text-brand tracking-[0.06em] uppercase">Screenshots</div>
          <h2 className="text-[length:var(--text-4xl)] font-semibold tracking-tight mt-4 text-balance">Slide a screenshot across the table.</h2>
          <p className="mt-[1.125rem] text-muted-foreground leading-relaxed text-[length:var(--text-lg)] text-pretty">
            Drop an image into a channel and it pops into the notch. A quick "look at this", without
            spinning your laptop around.
          </p>
        </div>

        <div className="flex justify-center ml-[calc(50%_-_50vw)] mr-[calc(50%_-_50vw)]">
          <MacScreen className="w-[min(1180px,90vw)] max-w-none [transform:none]">
            <div className="absolute top-[7px] left-1/2 bg-black z-[5] [transform:translateX(-50%)] [transform-origin:top_center] cursor-pointer w-[420px] h-[310px] [clip-path:path('M0_0_Q15_0_15_15_L15_290_Q15_310_35_310_L385_310_Q405_310_405_290_L405_15_Q405_0_420_0_Z')] [filter:drop-shadow(0_10px_16px_oklch(0_0_0_/_0.5))] [transition:width_0.42s_cubic-bezier(0.33,1,0.68,1),height_0.42s_cubic-bezier(0.33,1,0.68,1),clip-path_0.42s_cubic-bezier(0.33,1,0.68,1),filter_0.3s_ease] motion-reduce:[transition:none] max-[900px]:[transform:translateX(-50%)_scale(0.75)] max-[600px]:[transform:translateX(-50%)_scale(0.58)]">
              <span className="absolute left-1/2 -translate-x-1/2 top-[11px] w-[7px] h-[7px] z-[3] rounded-full [background:radial-gradient(circle_at_35%_35%,oklch(0.38_0.05_250),oklch(0.17_0.03_255)_55%,oklch(0.05_0_0)_100%)] shadow-[0_0_0_1.5px_oklch(0.09_0_0),inset_0_0_2px_oklch(0.6_0.08_250_/_0.5)]"></span>
              <div className="absolute inset-0 overflow-hidden rounded-b-[20px] opacity-100 visible [font-family:system-ui,-apple-system,sans-serif] [-webkit-font-smoothing:antialiased] flex flex-col [padding:38px_26px_18px] gap-[9px] text-left" onMouseLeave={hide}>
                <div className="flex items-start gap-[12px] p-[4px_6px]">
                  <Avatar name="Jurij" className="flex-none w-[34px] h-[34px] rounded-full flex items-center justify-center [font-family:ui-rounded,system-ui,sans-serif] font-bold text-[13px] leading-[1] text-white" />
                  <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                    <div className="flex items-center gap-[4px] leading-[1.1] text-[oklch(1_0_0_/_0.55)]">
                      <span className="text-[11px] font-semibold">Jurij</span>
                      <Globe className="flex-none w-[8.5px]! h-[8.5px]!" strokeWidth={1.8} aria-hidden />
                      <span className="text-[12px]">·</span>
                      <span className="flex-none w-[6px] h-[6px] rounded-full" style={{ background: '#bf5af2' }} />
                      <span>espresso-gang-03</span>
                    </div>
                    <div className="grid grid-cols-3 gap-[8px] mt-[4px]">
                      {ALBUM.map((img) => (
                        <span
                          key={img.id}
                          className="aspect-square rounded-[9px] border border-[oklch(1_0_0_/_0.16)] bg-cover bg-center p-0 cursor-pointer transition-[transform,box-shadow] duration-[0.18s] ease hover:-translate-y-px hover:scale-[1.02] hover:outline-none hover:shadow-[0_0_0_2px_oklch(1_0_0_/_0.4)] focus-visible:-translate-y-px focus-visible:scale-[1.02] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_oklch(1_0_0_/_0.4)] motion-reduce:transition-none"
                          style={{ backgroundImage: img.grad }}
                          onMouseEnter={() => show(img)}
                        />
                      ))}
                    </div>
                    <div className="text-[14px] font-medium leading-[1.2] text-white mt-[2px]">how do you like these? 👀</div>
                  </div>
                </div>

                <div className="flex flex-col p-[0_6px_6px]">
                  <div className="h-px bg-[oklch(1_0_0_/_0.15)] mb-[3px]" />
                  <div className="flex items-center gap-[4px] w-full min-h-[20px] p-0">
                    <span className="flex-none flex items-center gap-[4px]">
                      <span className="flex-none w-[5px] h-[5px] rounded-full" style={{ background: '#0a84ff' }} />
                      <span className="text-[10px] font-semibold text-[oklch(1_0_0_/_0.5)]">Sam</span>
                      <Globe className="flex-none w-[8px]! h-[8px]! text-[oklch(1_0_0_/_0.3)]" strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="flex gap-[5px] ml-auto">
                      {HIST_ALBUM.map((img) => (
                        <span
                          key={img.id}
                          className="w-[34px] h-[26px] rounded-[5px] border border-[oklch(1_0_0_/_0.16)] bg-cover bg-center p-0 cursor-pointer transition-[transform,box-shadow] duration-150 hover:scale-[1.04] hover:outline-none hover:shadow-[0_0_0_2px_oklch(1_0_0_/_0.4)] focus-visible:scale-[1.04] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_oklch(1_0_0_/_0.4)] motion-reduce:transition-none"
                          style={{ backgroundImage: img.grad }}
                          onMouseEnter={() => show(img)}
                        />
                      ))}
                    </span>
                  </div>
                  <div className="flex items-center gap-[4px] w-full min-h-[20px] p-0">
                    <span className="flex-none flex items-center gap-[4px]">
                      <span className="flex-none w-[5px] h-[5px] rounded-full" style={{ background: '#ff375f' }} />
                      <span className="text-[10px] font-semibold text-[oklch(1_0_0_/_0.5)]">Taylor</span>
                      <Globe className="flex-none w-[8px]! h-[8px]! text-[oklch(1_0_0_/_0.3)]" strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="flex-[0_1_auto] min-w-0 mr-auto text-[11px] text-[oklch(1_0_0_/_0.55)] whitespace-nowrap overflow-hidden text-ellipsis">ship it 🚀</span>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={cn(
                "absolute inset-2 z-[6] grid place-items-center [padding:46px_26px_26px] bg-[oklch(0_0_0_/_0.5)] backdrop-blur-[2px] opacity-0 invisible [transition:opacity_0.22s_ease,visibility_0s_linear_0.22s] pointer-events-none",
                preview && 'opacity-100 visible [transition:opacity_0.22s_ease,visibility_0s]',
              )}
              aria-hidden
            >
              {preview && (
                <span
                  className="w-[min(78%,520px)] aspect-[3/2] max-h-full rounded-[16px] border border-[oklch(1_0_0_/_0.14)] bg-cover bg-center shadow-[0_28px_60px_-12px_oklch(0_0_0_/_0.6)] scale-100 transition-transform duration-[0.22s] ease motion-reduce:scale-100 motion-reduce:transition-none"
                  style={{ backgroundImage: preview.grad }}
                />
              )}
            </div>
          </MacScreen>
        </div>
      </div>
    </section>
  )
}
