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
      className="inline-flex items-center gap-2.5 flex-none h-[54px] px-4 border border-border rounded-[var(--radius-lg)] bg-card hover:border-ring hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-[border-color,transform,box-shadow] duration-150"
      href={href}
      target="_blank"
      rel="noopener"
      tabIndex={duplicate ? -1 : undefined}
    >
      {img ? (
        <img src={img} alt={alt ?? `Featured on ${name}`} loading="lazy" decoding="async" />
      ) : (
        <>
          <span className="inline-flex items-center justify-center flex-none w-[30px] h-[30px] rounded-[var(--radius-md)] bg-[var(--brand-soft)] text-brand shadow-[0_0_calc(var(--glow)*16px)_color-mix(in_oklab,var(--brand)_18%,transparent)]">
            <Rocket className="w-[15px]! h-[15px]!" aria-hidden />
          </span>
          <span className="flex flex-col text-left leading-[1.2] gap-px">
            <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-brand">Featured on</span>
            <span className="text-[length:var(--text-sm)] font-semibold text-foreground whitespace-nowrap">{name}</span>
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
    <section className="text-center overflow-hidden">
      <div className="mx-auto max-w-[1400px] px-8">
        <div className="font-mono text-[length:var(--text-xs)] text-brand tracking-[0.06em] uppercase">Launch</div>
        <h2 className="text-[length:var(--text-4xl)] font-semibold tracking-tight mt-4">Out in the wild.</h2>
        <p className="max-w-[52ch] mt-3 mx-auto text-muted-foreground leading-relaxed text-pretty">
          Spotted us on a launch board? An upvote is always welcome.
        </p>
      </div>
      <div className="group mt-12 py-3 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] [-webkit-mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] motion-reduce:[mask-image:none] motion-reduce:[-webkit-mask-image:none]">
        <div className="flex items-center gap-4 w-max animate-[badge-scroll_38s_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:w-auto">
          {platforms.map((p) => (
            <LaunchBadge key={p.name} platform={p} />
          ))}
          <span className="[display:contents] motion-reduce:hidden" aria-hidden>
            {platforms.map((p) => (
              <LaunchBadge key={`${p.name}-dup`} platform={p} duplicate />
            ))}
          </span>
        </div>
      </div>
    </section>
  )
}
