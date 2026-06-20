export function HowItWorks() {
  return (
    <section id="how">
      <div className="container">
        <div className="section-head how-head-center">
          <div className="section-kicker">How it works</div>
          <h2>Name a channel, start munkeling.</h2>
          <p>Name your channel anything. Share the name with your people and you're in.</p>
          <p>
            Munkels pop into your notch and fade on their own. Want a second look? Open the history,
            where each one waits a minute for you.
          </p>
        </div>
        <div className="how-show" aria-hidden>
          <span className="code-chip">blue-table-42</span>
          <div className="mini-notch">
            <img src="/avatars/01.png" alt="" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="mn-name">Alex</span>
              <span>down in 5</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
