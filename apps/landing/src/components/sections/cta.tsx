import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { usePostHog } from '@posthog/react'

import { DownloadButton } from '@/components/download-button'
import { GithubButton } from '@/components/github-button'
import { BREW_CMD } from '@/lib/constants'

function BrewCmd() {
  const posthog = usePostHog()
  const [copied, setCopied] = useState(false)

  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(BREW_CMD).catch(() => {})
    posthog?.capture('cta_brew_copied', { location: 'footer' })
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="install-cmd brew-cmd">
      <div className="install-body">
        <span className="prompt">$</span>
        <span>{BREW_CMD}</span>
        <button
          className={`install-copy${copied ? ' copied' : ''}`}
          onClick={copy}
          aria-label="Copy install command"
        >
          <Copy className="ic-copy" strokeWidth={2} aria-hidden />
          <Check className="ic-check" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  )
}

export function Cta() {
  return (
    <section className="cta">
      <div className="container">
        <div className="app-icon app-icon-sm">
          <img src="/app-icon.png" alt="" width={84} height={84} />
        </div>
        <h2>Start munkeling.</h2>
        <p>
          Free and open source. Read the code, open an issue, send a pull request. We'd love the
          company.
        </p>
        <div className="hero-ctas">
          <DownloadButton location="footer" />
          <GithubButton location="footer" />
        </div>
        <BrewCmd />
        <div className="hero-meta">Signed &amp; notarized · no app telemetry · macOS 14+</div>
      </div>
    </section>
  )
}
