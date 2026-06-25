import { Rocket } from 'lucide-react'

type LaunchPlatform = {
  name: string
  href: string
  live?: boolean
  img?: string
  alt?: string
}

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

function LaunchBadge({
  platform,
  duplicate = false,
}: {
  platform: LaunchPlatform
  duplicate?: boolean
}) {
  const { name, href, img, alt } = platform
  return (
    <a
      className="launch-badge"
      href={href}
      target="_blank"
      rel="noopener"
      tabIndex={duplicate ? -1 : undefined}
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

export function LaunchBadgeTrack({ liveOnly = false }: { liveOnly?: boolean }) {
  const platforms = liveOnly ? LAUNCH_PLATFORMS.filter((p) => p.live) : LAUNCH_PLATFORMS
  if (platforms.length === 0) return null
  return (
    <section className="badge-track">
      <div className="container">
        <div className="section-kicker">Launch</div>
        <h2>Out in the wild.</h2>
        <p>Spotted us on a launch board? An upvote is always welcome.</p>
      </div>
      <div className="badge-marquee">
        <div className="badge-marquee-row">
          {platforms.map((p) => (
            <LaunchBadge key={p.name} platform={p} />
          ))}
          <span className="badge-dup" aria-hidden>
            {platforms.map((p) => (
              <LaunchBadge key={`${p.name}-dup`} platform={p} duplicate />
            ))}
          </span>
        </div>
      </div>
    </section>
  )
}
