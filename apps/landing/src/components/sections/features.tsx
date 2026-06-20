import { Feather, Lock, TimerOff } from 'lucide-react'

export function Features() {
  return (
    <section id="features">
      <div className="container">
        <div className="section-head">
          <div className="section-kicker">Why munkel</div>
          <h2>Small surface. Sharp edges.</h2>
          <p>Quick, quiet, and out of your way.</p>
        </div>
        <div className="features">
          <div className="feature">
            <div className="feature-icon">
              <Feather aria-hidden />
            </div>
            <h3>Stays out of your flow</h3>
            <p>A munkel glances past in your notch, so you read it and keep working.</p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <TimerOff aria-hidden />
            </div>
            <h3>Light by nature</h3>
            <p>
              Munkels fade on their own. A one-minute history catches anything you missed, then it's
              truly gone.
            </p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <Lock aria-hidden />
            </div>
            <h3>Just your people</h3>
            <p>
              Only the people with the channel name can read your munkels. They're yours to keep
              quiet.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
