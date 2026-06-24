import type { ReactNode } from 'react'
import { BatteryMedium, Wifi } from 'lucide-react'

// Deterministic avatar (mirrors the hero's): an initial on a name-hashed gradient.
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

/**
 * A still macOS display: wallpaper + a minimal (Apple-logo-only) menu bar.
 * Pass the notch (and any overlay) as children. Sizing comes from `className`
 * on the `.macbook` element or the surrounding layout.
 */
export function MacScreen({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={`macbook${className ? ` ${className}` : ''}`}>
      <div className="mb-screen">
        <div className="mb-display">
          <div className="mb-wallpaper"></div>
          <div className="mb-menubar">
            <div className="mb-menu">
              <span className="mb-apple" aria-hidden>
                &#xF8FF;
              </span>
            </div>
            <div className="mb-menu-right">
              <BatteryMedium aria-hidden />
              <Wifi aria-hidden />
              <span className="mb-clock">Sun 22. Jun 09:41</span>
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
