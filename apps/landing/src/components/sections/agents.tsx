import { useState } from 'react'
import { Check, Copy, Sparkles } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const INSTALL_CMDS = {
  npx: 'npx skills add limehq/munkel',
  pnpm: 'pnpm dlx skills add limehq/munkel',
  yarn: 'yarn dlx skills add limehq/munkel',
  bun: 'bunx skills add limehq/munkel',
} as const

type Pm = keyof typeof INSTALL_CMDS

function InstallCmd() {
  const [pm, setPm] = useState<Pm>('npx')
  const [copied, setCopied] = useState(false)

  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(INSTALL_CMDS[pm]).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <Tabs value={pm} onValueChange={(v) => setPm(v as Pm)} className="install-cmd">
      <div className="install-bar">
        <TabsList className="install-tabs">
          {(Object.keys(INSTALL_CMDS) as Pm[]).map((key) => (
            <TabsTrigger key={key} value={key}>
              {key}
            </TabsTrigger>
          ))}
        </TabsList>
        <button
          className={`install-copy${copied ? ' copied' : ''}`}
          onClick={copy}
          aria-label="Copy command"
        >
          <Copy className="ic-copy" strokeWidth={2} aria-hidden />
          <Check className="ic-check" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
      <div className="install-body">
        <span className="prompt">$</span>
        <span>{INSTALL_CMDS[pm]}</span>
      </div>
    </Tabs>
  )
}

export function Agents() {
  return (
    <section id="agents">
      <div className="container">
        <div className="agents-grid">
          <div className="agents-copy">
            <div className="section-kicker">Agents</div>
            <h2>LLM ready.</h2>
            <p>
              Plain text in, plain text out. Anything that runs a shell can munkel, including the
              agent you already use.
            </p>
            <InstallCmd />
          </div>
          <ul className="agent-examples">
            <li className="agent-example">
              <Sparkles aria-hidden />
              <span>
                "Run the tests, then munkel <code className="ae-chan">eng</code> when they pass."
              </span>
            </li>
            <li className="agent-example">
              <Sparkles aria-hidden />
              <span>
                "When the deploy finishes, munkel the release notes to{' '}
                <code className="ae-chan">blue-table-42</code>."
              </span>
            </li>
            <li className="agent-example">
              <Sparkles aria-hidden />
              <span>
                "Summarize today's pull requests and munkel them to{' '}
                <code className="ae-chan">team</code>."
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
