import { useState } from 'react'
import { Check, Copy, Sparkles } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

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
    <Tabs
      value={pm}
      onValueChange={(v) => setPm(v as Pm)}
      className="mt-6! mb-0! max-w-[560px] border border-border rounded-[var(--radius-lg)] bg-[oklch(0.17_0_0)] [html:not(.dark)_&]:bg-[oklch(0.205_0_0)] overflow-hidden shadow-[var(--shadow-sm)]"
    >
      <div className="flex items-center justify-between py-1.5 pr-1.5 pl-2 border-b border-b-[oklch(1_0_0_/_0.08)]">
        <TabsList className="flex gap-0.5">
          {(Object.keys(INSTALL_CMDS) as Pm[]).map((key) => (
            <TabsTrigger
              key={key}
              value={key}
              className="font-mono text-[length:var(--text-xs)] text-[oklch(0.97_0_0_/_0.55)] bg-transparent border-0 rounded-[var(--radius-sm)] px-2.5 py-1 transition-[background,color] duration-150 hover:text-[oklch(0.97_0_0_/_0.85)] data-[state=active]:bg-[oklch(1_0_0_/_0.1)] data-[state=active]:text-[oklch(0.97_0_0)]"
            >
              {key}
            </TabsTrigger>
          ))}
        </TabsList>
        <button
          className="inline-flex items-center justify-center w-[28px] h-[28px] border-0 rounded-[var(--radius-sm)] bg-transparent text-[oklch(0.97_0_0_/_0.6)] transition-[background,color] duration-150 hover:bg-[oklch(1_0_0_/_0.1)] hover:text-[oklch(0.97_0_0)]"
          onClick={copy}
          aria-label="Copy command"
        >
          {copied ? (
            <Check className="w-[14px]! h-[14px]! text-brand" strokeWidth={2.5} aria-hidden />
          ) : (
            <Copy className="w-[14px]! h-[14px]!" strokeWidth={2} aria-hidden />
          )}
        </button>
      </div>
      {(Object.keys(INSTALL_CMDS) as Pm[]).map((key) => (
        <TabsContent
          key={key}
          value={key}
          forceMount
          className="font-mono text-[length:var(--text-sm)] px-4 py-3.5 text-[oklch(0.92_0_0)] whitespace-nowrap overflow-x-auto data-[state=inactive]:hidden"
        >
          <span className="text-[oklch(0.97_0_0_/_0.45)] mr-[0.75ch] select-none">$</span>
          <span>{INSTALL_CMDS[key]}</span>
        </TabsContent>
      ))}
    </Tabs>
  )
}

export function Agents() {
  return (
    <section id="agents">
      <div className="mx-auto max-w-[1400px] px-8">
        <div className="grid grid-cols-2 gap-y-12 gap-x-16 items-start max-[900px]:grid-cols-1">
          <div>
            <div className="font-mono text-[length:var(--text-xs)] text-brand tracking-[0.06em] uppercase">
              Agents
            </div>
            <h2 className="text-[length:var(--text-4xl)] font-semibold tracking-tight mt-4">
              LLM ready.
            </h2>
            <p className="mt-[1.125rem] text-muted-foreground leading-relaxed text-[length:var(--text-lg)] text-pretty">
              Plain text in, plain text out. Anything that runs a shell can munkel, including the
              agent you already use.
            </p>
            <InstallCmd />
          </div>
          <ul className="flex flex-col gap-4 max-w-[820px] m-0 p-0 list-none">
            <li className="flex items-start gap-3 text-[length:var(--text-lg)] leading-snug text-foreground text-pretty">
              <Sparkles className="w-[18px]! h-[18px]! text-brand flex-none mt-[0.3em]" aria-hidden />
              <span>
                "Run the tests, then munkel{' '}
                <code className="font-mono text-[0.9em] text-brand">eng</code> when they pass."
              </span>
            </li>
            <li className="flex items-start gap-3 text-[length:var(--text-lg)] leading-snug text-foreground text-pretty">
              <Sparkles className="w-[18px]! h-[18px]! text-brand flex-none mt-[0.3em]" aria-hidden />
              <span>
                "When the deploy finishes, munkel the release notes to{' '}
                <code className="font-mono text-[0.9em] text-brand">blue-table-42</code>."
              </span>
            </li>
            <li className="flex items-start gap-3 text-[length:var(--text-lg)] leading-snug text-foreground text-pretty">
              <Sparkles className="w-[18px]! h-[18px]! text-brand flex-none mt-[0.3em]" aria-hidden />
              <span>
                "Summarize today's pull requests and munkel them to{' '}
                <code className="font-mono text-[0.9em] text-brand">team</code>."
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
