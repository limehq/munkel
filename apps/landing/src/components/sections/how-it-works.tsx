export function HowItWorks() {
  return (
    <section id="how">
      <div className="container">
        <div className="section-head how-head-center">
          <div className="section-kicker">How it works</div>
          <h2>Name a channel, start munkeling.</h2>
          <p>Pick a name, share it, and you're whispering.</p>
        </div>
        <div className="how-steps">
          <figure className="how-step">
            <div className="shot-frame crossfade">
              <img
                src="/shots/join.png"
                alt="Munkel menu bar popover: type a channel name to join or create one"
                loading="lazy"
              />
              <img src="/shots/join-2.png" alt="" className="frame-b" loading="lazy" aria-hidden />
            </div>
            <figcaption>
              <span className="how-step-label">Join a channel</span>
              Pick a name, you're in.
            </figcaption>
          </figure>
          <figure className="how-step">
            <div className="shot-frame crossfade">
              <img
                src="/shots/compose.png"
                alt="Munkel floating compose window sending a quick note to a channel"
                loading="lazy"
              />
              <img src="/shots/compose-2.png" alt="" className="frame-b" loading="lazy" aria-hidden />
            </div>
            <figcaption>
              <span className="how-step-label">Whisper a quick note</span>
              A floating box. Send and forget.
            </figcaption>
          </figure>
          <figure className="how-step">
            <div className="shot-frame crossfade">
              <img
                src="/shots/notch.png"
                alt="A munkel in the MacBook notch with the recent replies"
                loading="lazy"
              />
              <img src="/shots/notch-2.png" alt="" className="frame-b" loading="lazy" aria-hidden />
            </div>
            <figcaption>
              <span className="how-step-label">Read it in the notch</span>
              It slides out, then it's gone.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
