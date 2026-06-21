export function HowItWorks() {
  return (
    <section id="how">
      <div className="container">
        <div className="how-grid">
          <div className="how-head">
            <div className="section-kicker">How it works</div>
            <h2>A channel is born from a code.</h2>
            <p>
              Group chats want your attention — badges to clear, threads to catch up on. Munkel
              doesn't: a message glances past in the notch and is gone.
            </p>
            <p>
              No invites, no server-side channel state. Sign in with GitHub once, then three steps
              and you're Munkeling.
            </p>
          </div>
          <div className="timeline">
            <div className="tl-step">
              <span className="tl-node">01</span>
              <h3>Create a channel</h3>
              <p>
                The app mints a human-readable code. Say it across the table or paste it in a
                chat. That's the whole onboarding.
              </p>
              <div className="tl-visual">
                <span className="code-chip">blue-table-42</span>
              </div>
            </div>
            <div className="tl-step">
              <span className="tl-node">02</span>
              <h3>Friends join</h3>
              <p>
                Anyone with the code is in. The code doubles as the AES-256-GCM key, so the relay
                only ever routes opaque blobs.
              </p>
              <div className="tl-visual">
                <div className="avatar-stack">
                  <img src="/avatars/01.png" alt="Alex" />
                  <img src="/avatars/02.png" alt="Sam" />
                  <img src="/avatars/05.png" alt="Morgan" />
                  <span className="joined">3 joined</span>
                </div>
              </div>
            </div>
            <div className="tl-step">
              <span className="tl-node">03</span>
              <h3>Read the notch</h3>
              <p>
                Messages slide out, linger, disappear. Hover to hold one open, click to reply
                right in the notch — it closes again after you send.
              </p>
              <div className="tl-visual">
                <div className="mini-notch">
                  <img src="/avatars/01.png" alt="" />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="mn-name">Alex</span>
                    <span>down in 5</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
