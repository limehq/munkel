import { createFileRoute } from '@tanstack/react-router'

import { LegalPage } from '@/components/legal/legal-page'

export const Route = createFileRoute('/imprint')({
  head: () => ({
    meta: [
      { title: 'Imprint · Munkel' },
      {
        name: 'description',
        content: 'Legal disclosure and provider identification for Munkel.',
      },
    ],
  }),
  component: ImprintPage,
})

function ImprintPage() {
  return (
    <LegalPage
      title="Imprint"
      intro="Information according to § 5 DDG (formerly § 5 TMG)."
    >
      <h2>Provider</h2>
      <dl className="grid grid-cols-[minmax(7rem,12rem)_1fr] gap-x-6 gap-y-2 mt-5 max-[600px]:grid-cols-1 max-[600px]:gap-x-0 max-[600px]:gap-y-[0.125rem]">
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">Company</dt>
        <dd className="text-foreground max-[600px]:mb-3">Unique (Deutschland) GmbH</dd>
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">Address</dt>
        <dd className="text-foreground max-[600px]:mb-3">
          Bei den Mühren 1
          <br />
          20457 Hamburg
        </dd>
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">Register</dt>
        <dd className="text-foreground max-[600px]:mb-3">Commercial register: HRB 40590</dd>
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">Register court</dt>
        <dd className="text-foreground max-[600px]:mb-3">Amtsgericht Hamburg</dd>
      </dl>

      <h2>Contact</h2>
      <dl className="grid grid-cols-[minmax(7rem,12rem)_1fr] gap-x-6 gap-y-2 mt-5 max-[600px]:grid-cols-1 max-[600px]:gap-x-0 max-[600px]:gap-y-[0.125rem]">
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">Phone</dt>
        <dd className="text-foreground max-[600px]:mb-3">
          <a href="tel:+4940227187">+49 (0) 40 227 187 – 0</a>
        </dd>
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">E-Mail</dt>
        <dd className="text-foreground max-[600px]:mb-3">
          <a href="mailto:hey@munkel.app">hey@munkel.app</a>
        </dd>
      </dl>

      <h2>VAT identification number</h2>
      <p>
        VAT ID according to § 27 a of the German Value Added Tax Act (UStG):
        DE118689805
      </p>

      <h2>Editorial responsibility (§ 18 Abs. 2 MStV)</h2>
      <dl className="grid grid-cols-[minmax(7rem,12rem)_1fr] gap-x-6 gap-y-2 mt-5 max-[600px]:grid-cols-1 max-[600px]:gap-x-0 max-[600px]:gap-y-[0.125rem]">
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">Name</dt>
        <dd className="text-foreground max-[600px]:mb-3">Jurij Koch</dd>
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">Phone</dt>
        <dd className="text-foreground max-[600px]:mb-3">
          <a href="tel:+494022718715">+49 (0) 40 227 187 – 15</a>
        </dd>
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">E-Mail</dt>
        <dd className="text-foreground max-[600px]:mb-3">
          <a href="mailto:hey@munkel.app">hey@munkel.app</a>
        </dd>
      </dl>
    </LegalPage>
  )
}
