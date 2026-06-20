import { MonitorOff } from 'lucide-react'

import { PROTOCOL_URL } from '@/lib/constants'

export function Privacy() {
  return (
    <section id="privacy">
      <div className="container">
        <div className="section-head">
          <div className="section-kicker">Privacy</div>
          <h2>Quiet, even on a shared screen.</h2>
          <p>Munkel keeps your notes to yourself, even mid-presentation.</p>
        </div>
        <div className="privacy-banner">
          <div className="privacy-banner-head">
            <div className="feature-icon">
              <MonitorOff aria-hidden />
            </div>
            <div>
              <h3>Invisible to screen sharing</h3>
              <p>
                Sharing your screen on Zoom or Meet? Your munkels stay on yours and out of what
                everyone sees.
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
        <div className="honest">
          <p>
            <strong>GitHub, just for your face.</strong> Sign in with GitHub once for your name and
            picture. That's the only profile munkel needs.
          </p>
          <p>
            Want the deep version? The whole protocol is <a href={PROTOCOL_URL}>public</a>.
          </p>
        </div>
      </div>
    </section>
  )
}
