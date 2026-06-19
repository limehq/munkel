import { useState } from 'react'
import { Bot, Check, Copy, Package } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const INSTALL_CMDS = {
  npx: 'npx skills add limehq/munkel',
  pnpm: 'pnpm dlx skills add limehq/munkel',
  yarn: 'yarn dlx skills add limehq/munkel',
  bun: 'bunx skills add limehq/munkel',
} as const

type Pm = keyof typeof INSTALL_CMDS

// Prominent shadcn-doc-style command block: Radix Tabs switch the package
// manager; the dark terminal shell is the shared `.install-*` styling.
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

/** Agents: the CLI is LLM-ready, with installable skills. */
export function Agents() {
  return (
    <section id="agents">
      <div className="container">
        <div className="section-head">
          <div className="section-kicker">Agents</div>
          <h2>LLM ready.</h2>
          <p>
            The CLI is plain text in, plain text out. Anything that can run a shell can munkel,
            including the agent you already use.
          </p>
        </div>
        <InstallCmd />
        <div className="features cols-2">
          <div className="feature">
            <div className="feature-icon">
              <Bot aria-hidden />
            </div>
            <h3>Agents can send for real</h3>
            <p>
              An LLM with shell access uses <span className="code">munkel</span> exactly like you
              do: pick a person or a circle, send the message. "Tell blue-table-42 I'm running
              late" becomes one command.
            </p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <Package aria-hidden />
            </div>
            <h3>Skills, ready to install</h3>
            <p>
              Prepared skills teach your agent munkel's commands in one step. Install once and your
              assistant knows how to munkel.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
