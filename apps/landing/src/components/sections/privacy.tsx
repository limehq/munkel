import { Check, Info, MonitorOff } from 'lucide-react'

import { PROTOCOL_URL } from '@/lib/constants'

/** Privacy: what the relay sees / never sees + the screen-sharing comparison. */
export function Privacy() {
  return (
    <section id="privacy">
      <div className="container">
        <div className="section-head">
          <div className="section-kicker">Privacy</div>
          <h2>What the relay sees.</h2>
          <p>
            One Durable Object per circle, WebSocket hibernation, no storage. Ephemerality is
            enforced by architecture, not policy. The relay knows nothing.
          </p>
        </div>
        <div className="privacy-banner">
          <div className="privacy-banner-head">
            <div className="feature-icon">
              <MonitorOff aria-hidden />
            </div>
            <div>
              <h3>Invisible to screen sharing</h3>
              <p>
                Presenting in Zoom, Teams, or Meet? Munkel excludes its windows from screen
                capture. Munkels stay on your screen, never on the shared one.
              </p>
            </div>
          </div>
          <div className="share-compare" aria-hidden>
            <figure className="share-panel">
              <div className="share-screen">
                <div className="share-menubar"></div>
                <div className="share-notch open">
                  <img src="/avatars/01.png" alt="" />
                  <span>down in 5</span>
                </div>
              </div>
              <figcaption>Your screen</figcaption>
            </figure>
            <figure className="share-panel">
              <div className="share-screen">
                <div className="share-menubar"></div>
                <div className="share-notch"></div>
              </div>
              <figcaption>What Zoom sees</figcaption>
            </figure>
          </div>
        </div>
        <div className="privacy-grid">
          <div className="privacy-card sees">
            <h3>The relay sees</h3>
            <ul>
              <li>
                <Info aria-hidden />
                <span className="li-text">
                  Opaque encrypted blobs <span className="li-sub">· ciphertext it has no key for</span>
                </span>
              </li>
              <li>
                <Info aria-hidden />
                <span className="li-text">
                  A group ID derived from your code <span className="li-sub">· not the code itself</span>
                </span>
              </li>
              <li>
                <Info aria-hidden />
                <span className="li-text">
                  Connection timing <span className="li-sub">· that someone is online, not who</span>
                </span>
              </li>
            </ul>
          </div>
          <div className="privacy-card never">
            <h3>The relay never sees</h3>
            <ul>
              <li>
                <Check strokeWidth={2} aria-hidden />
                <span className="li-text">
                  Message contents <span className="li-sub">· encrypted end-to-end</span>
                </span>
              </li>
              <li>
                <Check strokeWidth={2} aria-hidden />
                <span className="li-text">
                  Names &amp; avatars <span className="li-sub">· profiles travel inside encrypted payloads</span>
                </span>
              </li>
              <li>
                <Check strokeWidth={2} aria-hidden />
                <span className="li-text">
                  Any history <span className="li-sub">· nothing is ever written to storage</span>
                </span>
              </li>
            </ul>
          </div>
        </div>
        <div className="honest">
          <p>
            Munkel phones home to no one. The app opens exactly two kinds of connections: the
            relay — which sees only what's listed above — and GitHub, once, at login. No telemetry,
            no analytics, no crash reporting.
          </p>
          <p>
            On your Mac, circle codes and your profile live in the app's local settings — a code is
            never transmitted, to the relay or anyone else. The GitHub token exists only in memory
            for one profile fetch and is never written to disk.
          </p>
          <p>
            Honest limits: GitHub sees the device-flow login happen and lists Munkel under your
            authorized apps. Profiles are display-only; peers get no cryptographic proof that a
            member owns the GitHub name they show.
          </p>
          <p>
            The wire protocol is specified where it is enforced:{' '}
            <a href={PROTOCOL_URL}>protocol.ts</a>.
          </p>
        </div>
      </div>
    </section>
  )
}
