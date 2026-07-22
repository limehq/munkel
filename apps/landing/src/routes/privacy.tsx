import { createFileRoute } from '@tanstack/react-router'

import { LegalPage } from '@/components/legal/legal-page'
import { PROTOCOL_URL } from '@/lib/constants'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: 'Privacy · Munkel' },
      {
        name: 'description',
        content:
          'How Munkel handles personal data: privacy-first cookieless website analytics, self-hosted fonts, and end-to-end encrypted, ephemeral messaging.',
      },
    ],
  }),
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="How we handle personal data when you visit this website and use Munkel — written to be honest about how little we collect."
    >
      <p className="mt-2 text-muted-foreground text-[length:var(--text-sm)]">Last updated: 24 June 2026</p>

      <h2>1. Controller</h2>
      <p>
        The controller responsible for data processing on this website within
        the meaning of the General Data Protection Regulation (GDPR) is:
      </p>
      <dl className="grid grid-cols-[minmax(7rem,12rem)_1fr] gap-x-6 gap-y-2 mt-5 max-[600px]:grid-cols-1 max-[600px]:gap-x-0 max-[600px]:gap-y-[0.125rem]">
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">Company</dt>
        <dd className="text-foreground max-[600px]:mb-3">Unique (Deutschland) GmbH</dd>
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">Address</dt>
        <dd className="text-foreground max-[600px]:mb-3">
          Bei den Mühren 1
          <br />
          20457 Hamburg
        </dd>
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">E-Mail</dt>
        <dd className="text-foreground max-[600px]:mb-3">
          <a href="mailto:hey@munkel.app">hey@munkel.app</a>
        </dd>
        <dt className="text-[length:var(--text-sm)] text-muted-foreground font-mono tracking-wide">Phone</dt>
        <dd className="text-foreground max-[600px]:mb-3">
          <a href="tel:+4940227187">+49 (0) 40 227 187 – 0</a>
        </dd>
      </dl>

      <h2>2. Hosting and server logs</h2>
      <p>
        This website is hosted on the infrastructure of Cloudflare, Inc., which
        also provides content-delivery and edge-computing services for the
        site. When you access the site, Cloudflare necessarily processes
        connection data, including your IP address, to deliver the requested
        content and to ensure the security, stability, and integrity of the
        service. Server-side observability is enabled for this site, so request
        logs — which may include your IP address and request metadata — are
        generated to operate, secure, and troubleshoot the service.
      </p>
      <p>
        The legal basis for this processing is our legitimate interest in
        providing a secure and reliable website under Art. 6(1)(f) GDPR. We have
        concluded a data processing agreement (Auftragsverarbeitungsvertrag) with
        our hosting provider as required by Art. 28 GDPR. Cloudflare, Inc. is
        based in the USA; where connection data is processed outside the EU, this
        is safeguarded by EU Standard Contractual Clauses.
      </p>

      <h2>3. Fonts</h2>
      <p>
        All fonts used on this website are self-hosted and served from our own
        origin. We do <strong>not</strong> use the Google Fonts CDN or any other
        third-party font service, so no font request is made to an external
        provider and no data is transmitted to a third party for the purpose of
        displaying fonts.
      </p>

      <h2>4. Analytics</h2>
      <p>
        We use PostHog to understand, in aggregate, how this website is used —
        which pages are visited, where visitors arrive from, and when the
        download button is clicked. Analytics data is stored on PostHog Cloud EU
        servers in Frankfurt, Germany. PostHog is operated by PostHog Inc. (USA),
        which provides a data processing agreement (Auftragsverarbeitungsvertrag)
        under Art. 28 GDPR; insofar as personal data is accessed from outside the
        EU, it is safeguarded by the EU Standard Contractual Clauses that form
        part of that agreement.
      </p>
      <p>This analytics is deliberately minimal and privacy-preserving:</p>
      <ul>
        <li>
          It runs in a cookieless, memory-only mode. No cookie, no local-storage
          entry, no device fingerprint, and no stable cross-visit identifier is
          created — so there is nothing on your device to ask consent for, and no
          cookie banner.
        </li>
        <li>
          Requests are sent first-party, to a path on this domain that forwards
          them to PostHog. We never call PostHog's <span className="font-mono text-[0.875em] bg-muted px-1.5 py-0.5 rounded-[calc(var(--radius)*0.6)]">identify</span>{' '}
          function, so no personal profile is built, and we do not track you
          across other sites.
        </li>
        <li>
          Your IP address is used in transit only to approximate country-level
          location; it is not retained by us as an identifier. Session recording,
          autocapture, and web-vitals collection are switched off.
        </li>
        <li>
          We honour the <span className="font-mono text-[0.875em] bg-muted px-1.5 py-0.5 rounded-[calc(var(--radius)*0.6)]">Do-Not-Track</span> and Global
          Privacy Control signals: if your browser sends one, no analytics event
          is collected.
        </li>
      </ul>
      <p>
        The legal basis is our legitimate interest in measuring and improving the
        website under Art. 6(1)(f) GDPR. Because nothing is stored on or read from
        your device, the consent requirement of § 25 TDDDG (formerly TTDSG) does
        not apply.
      </p>
      <p>
        We retain this analytics data only as long as necessary for this purpose
        and delete it thereafter. You can object to this processing at any time
        with effect for the future: turn on Do-Not-Track or Global Privacy
        Control in your browser — we honour both and then collect nothing — or
        email us at <a href="mailto:hey@munkel.app">hey@munkel.app</a>.
      </p>

      <h2>5. Cookies and local storage</h2>
      <p>
        This website sets no cookies. The only thing it stores on your device is
        a single, strictly functional browser local-storage entry that remembers
        your light/dark theme preference (the key{' '}
        <span className="font-mono text-[0.875em] bg-muted px-1.5 py-0.5 rounded-[calc(var(--radius)*0.6)]">munkel-theme</span>). The analytics described in
        section 4 runs in a memory-only mode and writes nothing to your device —
        no cookie and no local-storage entry. The theme value never leaves your
        browser, is not used for tracking, and exists only so the site renders in
        your chosen appearance on your next visit.
      </p>

      <h2>6. The Munkel app and relay</h2>
      <p>
        Munkel itself is built around data minimisation. Messages are
        end-to-end encrypted and ephemeral: they are relayed between devices and
        then vanish — nothing is stored on the server. The relay cannot read
        message contents. For the technical details of how this works, see the{' '}
        <a href={PROTOCOL_URL} rel="noopener noreferrer">
          protocol specification
        </a>
        .
      </p>

      <h2>7. Your rights</h2>
      <p>
        Under the GDPR you have the following rights regarding your personal
        data:
      </p>
      <ul>
        <li>Right of access (Art. 15 GDPR)</li>
        <li>Right to rectification (Art. 16 GDPR)</li>
        <li>Right to erasure (Art. 17 GDPR)</li>
        <li>Right to restriction of processing (Art. 18 GDPR)</li>
        <li>Right to data portability (Art. 20 GDPR)</li>
        <li>Right to object to processing (Art. 21 GDPR)</li>
      </ul>
      <p>
        To exercise any of these rights, contact us at{' '}
        <a href="mailto:hey@munkel.app">hey@munkel.app</a>. You also have the
        right to lodge a complaint with a supervisory authority, in particular in
        the EU member state of your habitual residence, place of work, or the
        place of the alleged infringement. The supervisory authority responsible
        for us is the Hamburg Commissioner for Data Protection and Freedom of
        Information (Der Hamburgische Beauftragte für Datenschutz und
        Informationsfreiheit).
      </p>

      <h2>8. Changes to this policy</h2>
      <p>
        We may update this privacy policy to reflect changes to the website or to
        legal requirements. The current version always applies.
      </p>
    </LegalPage>
  )
}
