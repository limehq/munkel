import { usePostHog } from '@posthog/react'

import { Button } from '@/components/ui/button'
import { KofiIcon } from '@/components/icons'
import { SPONSOR_URL } from '@/lib/constants'

export function Pricing() {
  const posthog = usePostHog()

  return (
    <section id="pricing">
      <div className="mx-auto max-w-[1400px] px-8 flex flex-col items-center">
        <div className="flex flex-col items-center text-center gap-6">
          <div className="font-mono text-[length:var(--text-xs)] text-brand tracking-[0.06em] uppercase">Pricing</div>
          <h2 className="text-[clamp(2rem,4.5vw,3rem)] font-bold tracking-[var(--tracking-tight)] leading-[1.05]">Free forever.</h2>
          <Button asChild variant="outline" className="mt-3">
            <a
              href={SPONSOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => posthog?.capture('cta_coffee_clicked', { location: 'pricing' })}
            >
              <KofiIcon className="text-brand" />
              Buy me a coffee
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
