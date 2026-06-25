import { usePostHog } from '@posthog/react'

import { Button } from '@/components/ui/button'
import { KofiIcon } from '@/components/icons'
import { SPONSOR_URL } from '@/lib/constants'

export function Pricing() {
  const posthog = usePostHog()

  return (
    <section id="pricing">
      <div className="container">
        <div className="pricing-minimal">
          <div className="section-kicker">Pricing</div>
          <h2>Free forever.</h2>
          <Button asChild variant="outline" className="kofi-button">
            <a
              href={SPONSOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => posthog?.capture('cta_coffee_clicked', { location: 'pricing' })}
            >
              <KofiIcon className="kofi-cup" />
              Buy me a coffee
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
