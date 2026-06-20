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
    q: 'Which chips does the app run on?',
    a: 'Both Apple Silicon and Intel, in one universal binary.',
  },
  {
    q: 'What is it built with?',
    a: 'Native Swift and SwiftUI, a small menu-bar app that stays light.',
  },
  {
    q: 'Is it signed and notarized?',
    a: 'Yes, every release, so Gatekeeper opens it without warnings.',
  },
  {
    q: 'Can I reply from the notch?',
    a: (
      <>
        Yes. Click a munkel, reply, and it tucks away when you send. The popover and{' '}
        <span className="code">munkel</span> CLI work too.
      </>
    ),
  },
  {
    q: 'What if my laptop has no notch?',
    a: 'Munkels float in a tidy panel instead. Same munkel, different spot.',
  },
]

export function Faq() {
  return (
    <section id="faq">
      <div className="container">
        <div className="faq-head">
          <div className="section-kicker">FAQ</div>
          <h2>Quick answers.</h2>
          <p>The practical bits about how it runs on your Mac.</p>
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
          Still curious? <a href={DISCUSSIONS_URL}>Start a discussion on GitHub.</a>
        </div>
      </div>
    </section>
  )
}
