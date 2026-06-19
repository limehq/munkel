import { Rocket } from 'lucide-react'

// Platforms Munkel is on. Until a platform's official badge image is added, it
// renders in-house (the "Featured on" pill). To swap in a real listing, set
// `live: true`, point `href` at our listing, and drop the platform's official
// badge into `img` — self-hosted under /badges so we never hot-link a third
// party (no layout shift, no tracking, no availability risk). See issue #8.
type LaunchPlatform = {
  name: string
  href: string
  live?: boolean
  /** Self-hosted official badge, e.g. '/badges/product-hunt.svg'. */
  img?: string
  alt?: string
}

// Source of truth + status tracking: docs/launch-platforms.md. This array
// mirrors the "live" rows from there; hrefs are platform homepages until we
// have our own listing URL for each.
const LAUNCH_PLATFORMS: LaunchPlatform[] = [
  { name: 'Product Hunt', href: 'https://www.producthunt.com' },
  { name: 'Peerlist', href: 'https://peerlist.io' },
  { name: 'Fazier', href: 'https://fazier.com' },
  { name: 'Uneed', href: 'https://www.uneed.best' },
  { name: 'MicroLaunch', href: 'https://microlaunch.net' },
  { name: 'Startup Fame', href: 'https://startupfa.me' },
  { name: 'Twelve Tools', href: 'https://twelve.tools' },
  { name: 'Findly.tools', href: 'https://findly.tools' },
  { name: 'LaunchIgniter', href: 'https://launchigniter.com' },
  { name: 'Dang.ai', href: 'https://dang.ai' },
]

function LaunchBadge({ platform }: { platform: LaunchPlatform }) {
  const { name, href, img, alt } = platform
  return (
    <a
      className="launch-badge"
      href={href}
      target="_blank"
      rel="noopener"
      aria-label={`Featured on ${name}`}
    >
      {img ? (
        <img src={img} alt={alt ?? `Featured on ${name}`} loading="lazy" decoding="async" />
      ) : (
        <>
          <span className="lb-glyph">
            <Rocket aria-hidden />
          </span>
          <span className="lb-text">
            <span className="lb-kicker">Featured on</span>
            <span className="lb-name">{name}</span>
          </span>
        </>
      )}
    </a>
  )
}

// A seamless marquee: the badge list is rendered twice (the duplicate is
// display:contents, so its badges join the same flex row with even spacing) and
// the row is translated by exactly -50%, looping without a seam. Under reduced
// motion the duplicate is hidden and the badges wrap statically. Pass liveOnly
// once we have real launches to shrink the strip to earned badges.
export function LaunchBadgeTrack({ liveOnly = false }: { liveOnly?: boolean }) {
  const platforms = liveOnly ? LAUNCH_PLATFORMS.filter((p) => p.live) : LAUNCH_PLATFORMS
  if (platforms.length === 0) return null
  return (
    <section className="badge-track">
      <div className="container">
        <div className="section-kicker">Launch</div>
        <h2>Out in the wild.</h2>
        <p>
          Munkel is out across the platforms where people hunt for new tools. Find us there — and
          an upvote is always welcome.
        </p>
      </div>
      <div className="badge-marquee">
        <div className="badge-marquee-row">
          {platforms.map((p) => (
            <LaunchBadge key={p.name} platform={p} />
          ))}
          <span className="badge-dup" aria-hidden>
            {platforms.map((p) => (
              <LaunchBadge key={`${p.name}-dup`} platform={p} />
            ))}
          </span>
        </div>
      </div>
    </section>
  )
}
