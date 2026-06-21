export function Screenshots() {
  return (
    <section id="screenshots">
      <div className="container">
        <div className="section-head shot-head">
          <div className="section-kicker">Screenshots</div>
          <h2>Slide a screenshot across the table.</h2>
          <p>
            Drop an image into a channel and it pops into the notch. A quick "look at this", without
            spinning your laptop around.
          </p>
        </div>
        <div className="shot-single">
          <div className="shot-frame crossfade">
            <img
              src="/shots/shot-collapsed.png"
              alt="A munkel with image attachments tucked into the notch"
              loading="lazy"
            />
            <img
              src="/shots/shot-expanded.png"
              alt=""
              className="frame-b"
              loading="lazy"
              aria-hidden
            />
          </div>
        </div>
      </div>
    </section>
  )
}
