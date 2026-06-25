import { ArrowRight, MonitorSmartphone } from 'lucide-react'
import { usePostHog } from '@posthog/react'

import { GITHUB_URL } from '@/lib/constants'

export function AnnounceBar() {
  const posthog = usePostHog()
  return (
    <a
      className="group flex flex-wrap items-center justify-center gap-2.5 border-b border-b-[color-mix(in_oklab,var(--brand)_26%,transparent)] bg-[color-mix(in_oklab,var(--brand)_12%,var(--background))] px-5 py-2 text-center text-[length:var(--text-sm)] leading-[1.3] text-foreground [transition:background_0.2s_ease] hover:bg-[color-mix(in_oklab,var(--brand)_18%,var(--background))] max-[560px]:gap-2 max-[560px]:px-4 max-[560px]:text-[length:var(--text-xs)]"
      href={GITHUB_URL}
      onClick={() => posthog?.capture('announce_windows_clicked')}
    >
      <span className="rounded-full bg-brand px-2 py-0.5 font-mono text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.06em] text-background">Soon</span>
      <span className="inline-flex items-center gap-2">
        <MonitorSmartphone className="text-brand shrink-0" aria-hidden />
        Windows is learning to munkel.
      </span>
      <ArrowRight
        className="text-muted-foreground [transition:transform_0.2s_ease] group-hover:[transform:translateX(3px)] max-[560px]:hidden"
        aria-hidden
      />
    </a>
  )
}
