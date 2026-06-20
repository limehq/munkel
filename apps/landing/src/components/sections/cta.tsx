import { useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { BREW_CMD, DOWNLOAD_URL, GITHUB_URL } from '@/lib/constants'

function BrewCmd() {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(BREW_CMD).catch(() => {})
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
          <Button asChild variant="primary">
            <a href={DOWNLOAD_URL}>
              <Download aria-hidden />
              Download for macOS
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={GITHUB_URL}>View on GitHub</a>
          </Button>
        </div>
        <BrewCmd />
        <div className="hero-meta">Signed &amp; notarized · no telemetry · macOS 14+</div>
      </div>
    </section>
  )
}
