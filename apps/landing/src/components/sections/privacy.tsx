import { Globe, Mic, MonitorOff, Video } from 'lucide-react'

import { Avatar, MacScreen } from './mac-screen'

const CALL = ['Mara', 'Tom', 'Lena']

// The window being shared — same on both screens (a stand-in slide/dashboard).
function SharedWindow() {
  return (
    <div className="pv-window">
      <div className="pv-winbar">
        <span className="pv-dot" />
        <span className="pv-dot" />
        <span className="pv-dot" />
        <span className="pv-wintitle">Q3 roadmap</span>
      </div>
      <div className="pv-winbody">
        <div className="pv-headline" />
        <div className="pv-chart">
          <span style={{ height: '42%' }} />
          <span style={{ height: '70%' }} />
          <span style={{ height: '54%' }} />
          <span style={{ height: '88%' }} />
          <span style={{ height: '63%' }} />
        </div>
      </div>
    </div>
  )
}

// The people on the call — a floating tile strip, visible on both screens.
function CallPeople() {
  return (
    <div className="pv-people">
      {CALL.map((n) => (
        <div key={n} className="pv-tile">
          <Avatar name={n} className="pv-face" />
          <span className="pv-name">{n}</span>
        </div>
      ))}
    </div>
  )
}

// The share controls — a local overlay only the sharer sees, never captured.
function ShareBar() {
  return (
    <div className="pv-sharebar">
      <span className="pv-rec" />
      <span className="pv-sharelabel">Sharing your screen</span>
      <span className="pv-divider" />
      <Mic className="pv-cicon" strokeWidth={2} aria-hidden />
      <Video className="pv-cicon" strokeWidth={2} aria-hidden />
      <span className="pv-stop">Stop</span>
    </div>
  )
}

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
                Sharing your screen on a call? Your munkels stay on yours and out of what everyone
                else sees.
              </p>
            </div>
          </div>
          <div className="share-compare" aria-hidden>
            <figure className="share-panel">
              <MacScreen className="mac-mini">
                <SharedWindow />
                <CallPeople />
                <ShareBar />
                <div className="mb-notch docked notch-mini">
                  <span className="notch-cam"></span>
                  <div className="nt">
                    <Avatar name="Alex" className="nt-avatar" />
                    <div className="nt-line">
                      <Globe className="nt-chan is-globe" strokeWidth={1.8} aria-hidden />
                      <span className="nt-text">down in 5</span>
                    </div>
                  </div>
                </div>
              </MacScreen>
              <figcaption>Your screen</figcaption>
            </figure>
            <figure className="share-panel">
              <MacScreen className="mac-mini mac-alt">
                <div className="pv-meet">
                  <div className="pv-meet-stage">
                    <div className="pv-stage-bar">
                      <span className="pv-sdot" />
                    </div>
                    <SharedWindow />
                  </div>
                  <div className="pv-meet-people">
                    {CALL.map((n) => (
                      <div key={n} className="pv-mtile">
                        <Avatar name={n} className="pv-mface" />
                        <span className="pv-mname">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </MacScreen>
              <figcaption>What everyone else sees</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  )
}
