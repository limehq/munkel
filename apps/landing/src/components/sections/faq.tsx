import type { ReactNode } from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { DISCUSSIONS_URL } from '@/lib/constants'

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: 'Apple Silicon or Intel?',
    a: 'Both. The app and the CLI ship as one universal binary — arm64 and x86_64.',
  },
  {
    q: 'Signed and notarized?',
    a: 'Yes. Every release is Developer ID-signed and notarized by Apple, so Gatekeeper opens it without warnings.',
  },
  {
    q: 'Electron or native?',
    a: 'Native Swift and SwiftUI. One small menu-bar binary, no embedded browser.',
  },
  {
    q: 'Can I reply from the notch?',
    a: (
      <>
        Yes — click a munkel and reply right there; the notch closes again after you send. You can
        also reply from the menu-bar popover or the <span className="code">munkel</span> CLI.
      </>
    ),
  },
  {
    q: 'How do I update?',
    a: (
      <>
        Installed with Homebrew: <span className="code">brew upgrade munkel</span>. Grabbed the zip:
        download the latest release and swap the app. There is no auto-updater.
      </>
    ),
  },
]

/** FAQ: centered card accordion (shadcn/Radix, one open at a time). */
export function Faq() {
  return (
    <section id="faq">
      <div className="container">
        <div className="faq-head">
          <div className="section-kicker">FAQ</div>
          <h2>Quick answers.</h2>
          <p>The practical details — how Munkel ships, runs, and updates on your Mac.</p>
        </div>
        <Accordion type="single" collapsible className="faq">
          {FAQS.map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <div className="faq-foot">
          Still curious? <a href={DISCUSSIONS_URL}>Open a discussion on GitHub →</a>
        </div>
      </div>
    </section>
  )
}
