export function Screenshots() {
  return (
    <section id="screenshots">
      <div className="container">
        <div className="section-head shot-head">
          <div className="section-kicker">Screenshots</div>
          <h2>Slide a screenshot across the table.</h2>
          <p>
            Drop an image into a channel and it pops into the notch. A quick "look at this",
            without spinning your laptop around.
          </p>
        </div>
        <div className="shot-demo" aria-hidden>
          <div className="shot-notch">
            <img className="shot-from" src="/avatars/02.png" alt="" />
            <div className="shot-thumbs">
              <span className="shot-thumb st-1"></span>
              <span className="shot-thumb st-2"></span>
              <span className="shot-thumb st-3"></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
