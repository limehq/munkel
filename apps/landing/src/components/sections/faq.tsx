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
    q: 'Can anyone else read my messages?',
    a: 'Only the people you share the channel name with. Munkels are end-to-end encrypted, the name doubles as the key, the relay cannot read them, and nothing is stored on the server.',
  },
  {
    q: 'Is Munkel free?',
    a: "Yes, completely. It's free and open source under the MIT license, with no paid tier and no catch.",
  },
  {
    q: 'Do I have to create an account?',
    a: 'Nope. You name a channel, share the name so friends can join, and sign in with GitHub once just for your name and picture. The token is never stored.',
  },
  {
    q: 'Do my messages get saved anywhere?',
    a: "They don't. A munkel shows in the notch for a few seconds and fades, a local history keeps it about a minute, then it's gone. Nothing is stored on the server, and the app sends no telemetry.",
  },
  {
    q: 'Will my Mac warn me when I install it?',
    a: "It won't. Every release is signed and notarized by Apple, so Gatekeeper opens it cleanly. It's a small native Swift menu-bar app, not Electron, so it stays light.",
  },
  {
    q: 'Will friends on older or non-notch Macs miss out?',
    a: 'Not at all. One universal binary covers Apple Silicon and Intel, and without a notch your munkels fall back to a tidy floating panel. Windows is coming soon.',
  },
]

export function Faq() {
  return (
    <section id="faq">
      <div className="container">
        <div className="faq-head">
          <div className="section-kicker">FAQ</div>
          <h2>Quick answers.</h2>
          <p>The things people ask before downloading.</p>
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
