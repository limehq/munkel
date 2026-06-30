import type { ReactNode } from 'react'

import { MenuBarBattery, MenuBarWifi } from '@/components/icons'
import { cn } from '@/lib/utils'

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
export function Avatar({ name, className }: { name: string; className?: string }) {
  const [c1, c2] = avatarPalette(name)
  return (
    <span className={className} style={{ backgroundImage: `linear-gradient(to bottom right, ${c1}, ${c2})` }}>
      {name[0]?.toUpperCase()}
    </span>
  )
}

export function MacScreen({
  className,
  wallpaperClassName,
  children,
}: {
  className?: string
  wallpaperClassName?: string
  children?: ReactNode
}) {
  return (
    <div className={cn('[transform-origin:50%_0%] max-w-[1000px] mx-auto', className)}>
      <div className="relative aspect-[16/10] bg-black rounded-[22px] border border-[oklch(1_0_0_/_0.16)] shadow-[0_40px_80px_-32px_oklch(0_0_0_/_0.5)]">
        <div className="absolute inset-2 rounded-[14px] overflow-hidden bg-[oklch(0.11_0_0)]">
          <div
            className={cn(
              'absolute inset-0 [background:radial-gradient(70%_55%_at_50%_0%,color-mix(in_oklab,var(--brand)_32%,oklch(0.15_0.01_250)),transparent_80%),radial-gradient(50%_45%_at_12%_70%,color-mix(in_oklab,var(--brand)_12%,oklch(0.13_0_0)),transparent_70%),linear-gradient(180deg,oklch(0.14_0.008_250),oklch(0.1_0.005_260))]',
              wallpaperClassName,
            )}
          ></div>
          <div className="absolute top-0 left-0 right-0 h-[28px] flex items-center justify-between px-[14px] [font-family:-apple-system,system-ui,sans-serif] text-[13px] text-[oklch(0.97_0_0_/_0.85)] bg-[oklch(0_0_0_/_0.5)] backdrop-blur-[12px] max-[900px]:h-[21px] max-[900px]:text-[11px] max-[600px]:h-[16px] max-[600px]:text-[9px]">
            <div className="flex items-center gap-[15px]">
              <span className="text-[15px] leading-[0] opacity-[0.92] max-[900px]:text-[13px] max-[600px]:text-[11px]" aria-hidden>
                &#xF8FF;
              </span>
            </div>
            <div className="flex items-center gap-[11px] [font-variant-numeric:tabular-nums]">
              <MenuBarBattery className="w-[24px] h-[12px] max-[900px]:w-[20px] max-[900px]:h-[10px] max-[600px]:w-[16px] max-[600px]:h-[8px]" />
              <MenuBarWifi className="w-[15px] h-[12px] max-[900px]:w-[13px] max-[900px]:h-[10px] max-[600px]:w-[11px] max-[600px]:h-[9px]" />
              <span className="font-medium">Sun 22. Jun 09:41</span>
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
