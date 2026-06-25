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
      <dl className="grid grid-cols-[minmax(7rem,12rem)_1fr] gap-x-6 gap-y-2 mt-5 max-[600px]:grid-cols-1 max-[600px]:gap-x-0 max-[600px]:gap-y-[0.125rem]">
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">E-Mail</dt>
        <dd className="text-foreground max-[600px]:mb-3">
          <a href="mailto:hey@munkel.app">hey@munkel.app</a>
        </dd>
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">Phone</dt>
        <dd className="text-foreground max-[600px]:mb-3">
          <a href="tel:+4940227187">+49 (0) 40 227 187 – 0</a>
        </dd>
      </dl>

      <h2>Editorial responsibility</h2>
      <p>
        For matters concerning editorial content, contact the person
        responsible under § 18 Abs. 2 MStV.
      </p>
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
