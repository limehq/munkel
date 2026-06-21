import { Laptop, Lock, Terminal, TimerOff, UserRoundX } from 'lucide-react'

import { GithubIcon } from '@/components/icons'

export function Features() {
  return (
    <section id="features">
      <div className="container">
        <div className="section-head">
          <div className="section-kicker">Features</div>
          <h2>Small surface. Sharp edges.</h2>
          <p>Everything it does, and the things it refuses to.</p>
        </div>
        <div className="features bento">
          <div className="feature b-a">
            <div className="feature-icon">
              <TimerOff aria-hidden />
            </div>
            <h3>Ephemeral by design</h3>
            <p>
              Messages live only in the moment. Nothing logged, nothing stored. Miss one and it's
              gone, like a real whisper.
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
              Encrypted on your Mac, with the channel name as the key. Our relay only ever sees
              sealed envelopes it can't open.
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
            <p>No email, no phone, no password. Munkel keeps no accounts and stores nothing about you.</p>
          </div>
          <div className="feature b-d">
            <div className="feature-icon">
              <GithubIcon />
            </div>
            <h3>GitHub identity</h3>
            <p>Sign in with GitHub once, for your name and face. The token is never stored.</p>
          </div>
          <div className="feature b-e">
            <div className="feature-icon">
              <Terminal aria-hidden />
            </div>
            <h3>munkel CLI</h3>
            <p>
              Send straight from your shell, script it, or hand it to an agent. An MCP server is on
              the way.
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
              No notch on your laptop? Munkels slide into a tidy floating panel instead. Same munkel,
              different spot.
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
