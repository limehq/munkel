import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { usePostHog } from '@posthog/react'

import { DownloadButton } from '@/components/download-button'
import { GithubButton } from '@/components/github-button'
import { BREW_CMD } from '@/lib/constants'
import { cn } from '@/lib/utils'

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
    <div className="mt-7 mx-auto max-w-fit border border-border rounded-[var(--radius-lg)] bg-[oklch(0.17_0_0)] [html:not(.dark)_&]:bg-[oklch(0.205_0_0)] overflow-hidden shadow-[var(--shadow-sm)]">
      <div className="flex items-center pl-4 pr-2 py-2 [font-family:var(--font-mono)] text-[length:var(--text-sm)] text-[oklch(0.92_0_0)] whitespace-nowrap overflow-x-auto">
        <span className="text-[oklch(0.97_0_0_/_0.45)] mr-[0.75ch] select-none">$</span>
        <span className="mr-3">{BREW_CMD}</span>
        <button
          className="inline-flex items-center justify-center w-[28px] h-[28px] border-0 rounded-[var(--radius-sm)] bg-transparent text-[oklch(0.97_0_0_/_0.6)] transition-[background,color] duration-150 hover:bg-[oklch(1_0_0_/_0.1)] hover:text-[oklch(0.97_0_0)]"
          onClick={copy}
          aria-label="Copy install command"
        >
          <Copy className={cn('w-[14px]! h-[14px]!', copied ? 'hidden' : 'block')} strokeWidth={2} aria-hidden />
          <Check className={cn('w-[14px]! h-[14px]! text-brand', copied ? 'block' : 'hidden')} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  )
}

export function Cta() {
  return (
    <section className="text-center">
      <div className="mx-auto max-w-[1400px] px-8">
        <div className="block w-21 mx-auto mb-5">
          <img
            src="/app-icon.png"
            alt=""
            width={84}
            height={84}
            className="w-full h-auto block [filter:drop-shadow(0_14px_28px_oklch(0_0_0/0.5))]"
          />
        </div>
        <h2 className="text-[clamp(2rem,4.5vw,3rem)] font-bold tracking-[-0.03em]">Start munkeling.</h2>
        <p className="mt-4 text-muted-foreground">
          Free and open source. Read the code, open an issue, send a pull request. We'd love the
          company.
        </p>
        <div className="flex justify-center gap-3 flex-wrap mt-8">
          <DownloadButton location="footer" />
          <GithubButton location="footer" />
        </div>
        <BrewCmd />
        <div className="mt-5 text-[length:var(--text-xs)] text-muted-foreground">Signed &amp; notarized · no app telemetry · macOS 14+</div>
      </div>
    </section>
  )
}
