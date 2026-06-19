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
      <dl className="legal-dl">
        <dt>Company</dt>
        <dd>Unique (Deutschland) GmbH</dd>
        <dt>Address</dt>
        <dd>
          Bei den Mühren 1
          <br />
          20457 Hamburg
        </dd>
        <dt>Register</dt>
        <dd>Commercial register: HRB 40590</dd>
        <dt>Register court</dt>
        <dd>Amtsgericht Hamburg</dd>
      </dl>

      <h2>Contact</h2>
      <dl className="legal-dl">
        <dt>Phone</dt>
        <dd>
          <a href="tel:+4940227187">+49 (0) 40 227 187 – 0</a>
        </dd>
        <dt>E-Mail</dt>
        <dd>
          <a href="mailto:hey@munkel.app">hey@munkel.app</a>
        </dd>
      </dl>

      <h2>VAT identification number</h2>
      <p>
        VAT ID according to § 27 a of the German Value Added Tax Act (UStG):
        DE118689805
      </p>

      <h2>Editorial responsibility (§ 18 Abs. 2 MStV)</h2>
      <dl className="legal-dl">
        <dt>Name</dt>
        <dd>Jurij Koch</dd>
        <dt>Phone</dt>
        <dd>
          <a href="tel:+494022718715">+49 (0) 40 227 187 – 15</a>
        </dd>
        <dt>E-Mail</dt>
        <dd>
          <a href="mailto:hey@munkel.app">hey@munkel.app</a>
        </dd>
      </dl>
    </LegalPage>
  )
}
