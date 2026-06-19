import { createFileRoute } from '@tanstack/react-router'

import { LegalPage } from '@/components/legal/legal-page'

export const Route = createFileRoute('/contact')({
  head: () => ({
    meta: [
      { title: 'Contact · Munkel' },
      {
        name: 'description',
        content: 'How to reach the team behind Munkel.',
      },
    ],
  }),
  component: ContactPage,
})

function ContactPage() {
  return (
    <LegalPage title="Contact" intro="How to reach the team behind Munkel.">
      <h2>General enquiries</h2>
      <p>
        For questions about Munkel — the product, the protocol, or anything
        else — reach us by e-mail or phone.
      </p>
      <dl className="legal-dl">
        <dt>E-Mail</dt>
        <dd>
          <a href="mailto:hey@munkel.app">hey@munkel.app</a>
        </dd>
        <dt>Phone</dt>
        <dd>
          <a href="tel:+4940227187">+49 (0) 40 227 187 – 0</a>
        </dd>
      </dl>

      <h2>Editorial responsibility</h2>
      <p>
        For matters concerning editorial content, contact the person
        responsible under § 18 Abs. 2 MStV.
      </p>
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
