import { useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { BREW_CMD, DOWNLOAD_URL, GITHUB_URL } from '@/lib/constants'

// Brew one-liner with a copy button (reuses the dark `.install-*` terminal shell).
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

/** Final CTA: founder note, download buttons, brew one-liner. */
export function Cta() {
  return (
    <section className="cta">
      <div className="container">
        <div className="founder-note">
          <p>
            "Munkel exists because group chats kept turning into obligations. It is meant for the
            kind of note you would say across a table: brief, visible, and easy to let go."
          </p>
          <span className="founder-sig">Built for lightweight, low-pressure messages.</span>
        </div>
        <div className="app-icon app-icon-sm">
          <img src="/app-icon.png" alt="" width={84} height={84} />
        </div>
        <h2>Start Munkeling.</h2>
        <p>
          Open source, MIT licensed. A native Swift app — no Electron — one signed &amp; notarized
          binary in your menu bar.
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
