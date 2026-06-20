import { Laptop, Lock, Terminal, TimerOff, UserRoundX } from 'lucide-react'

import { GithubIcon } from '@/components/icons'

export function Features() {
  return (
    <section id="features">
      <div className="container">
        <div className="section-head">
          <div className="section-kicker">Features</div>
          <h2>Small surface. Sharp edges.</h2>
          <p>Everything Munkel does, and the things it refuses to do.</p>
        </div>
        <div className="features bento">
          <div className="feature b-a">
            <div className="feature-icon">
              <TimerOff aria-hidden />
            </div>
            <h3>Ephemeral by design</h3>
            <p>
              The relay holds zero state: no database, no logs of content. Messages exist only in
              flight — offline means missed, like a real munkel. Nothing is ever written down.
            </p>
            <div className="bento-visual">
              <div className="vanish">
                <div className="vnotch v3" aria-hidden>
                  <img src="/avatars/02.png" alt="" />
                  <span>on my way</span>
                </div>
                <div className="vnotch v2" aria-hidden>
                  <img src="/avatars/05.png" alt="" />
                  <span>same table</span>
                </div>
                <div className="vnotch v1">
                  <img src="/avatars/01.png" alt="" />
                  <span>down in 5</span>
                </div>
              </div>
            </div>
          </div>
          <div className="feature b-b">
            <div className="feature-icon">
              <Lock aria-hidden />
            </div>
            <h3>End-to-end encrypted</h3>
            <p>
              AES-256-GCM, key derived from the circle code on-device. The relay routes ciphertext
              it cannot open — by construction, not by promise.
            </p>
            <div className="cipher" aria-hidden>
              <span className="blob">a9f2·c41</span>
              <span className="arrow">→</span>
              <span className="blob">7e0d·1bb</span>
              <span className="arrow">→</span>
              <span className="blob">f30c·e8a</span>
              <span className="arrow">→</span>
              <span className="lock">
                <Lock strokeWidth={1.8} aria-hidden />
              </span>
            </div>
          </div>
          <div className="feature b-c">
            <div className="feature-icon">
              <UserRoundX aria-hidden />
            </div>
            <h3>No accounts of our own</h3>
            <p>No email, no phone, no password. Munkel runs no identity service and keeps nothing server-side.</p>
          </div>
          <div className="feature b-d">
            <div className="feature-icon">
              <GithubIcon />
            </div>
            <h3>GitHub identity</h3>
            <p>Name and avatar via GitHub device flow — one login, token discarded.</p>
          </div>
          <div className="feature b-e">
            <div className="feature-icon">
              <Terminal aria-hidden />
            </div>
            <h3>munkel CLI</h3>
            <p>
              Send from your shell, script it, or wire it into agents over the app's control
              socket. An MCP server is on the way.
            </p>
            <div className="cli-line" aria-hidden>
              <div className="line">
                <span className="p">$ </span>munkel blue-table-42 all "omw"
              </div>
              <div className="ok">munkeled ✓</div>
            </div>
          </div>
          <div className="feature b-f">
            <div className="feature-icon">
              <Laptop aria-hidden />
            </div>
            <h3>Works without a notch</h3>
            <p>
              Older MacBook or external display? Messages fall back to an elegant floating panel —
              same munkel, different hardware.
            </p>
            <div className="float-panel" aria-hidden>
              <div className="panel">
                <img src="/avatars/03.png" alt="" />
                <div className="t">
                  <span className="n">Taylor</span>
                  <span className="m">table's free, come down</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
