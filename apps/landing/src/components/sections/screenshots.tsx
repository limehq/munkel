import { useRef, useState } from 'react'
import { Globe } from 'lucide-react'

import { Avatar, MacScreen } from './mac-screen'

// Placeholder album "images" — gradient tiles for now. Swap each `grad` for a
// real url(/shots/...) once we have product images.
type Shot = { id: string; grad: string }
const ALBUM: Shot[] = [
  { id: 'a1', grad: 'linear-gradient(135deg, #6aa0ff, #3857eb)' },
  { id: 'a2', grad: 'linear-gradient(135deg, #f6a44f, #eb6b2e)' },
  { id: 'a3', grad: 'linear-gradient(135deg, #bf85fa, #7a40e0)' },
]
const HIST_ALBUM: Shot[] = [
  { id: 'h1', grad: 'linear-gradient(135deg, #66d99e, #1a9475)' },
  { id: 'h2', grad: 'linear-gradient(135deg, #57d6db, #2980b8)' },
]

/**
 * A still (non-scroll) MacBook display showing the notch already expanded with
 * an image album. Hovering any thumbnail pops the picture full-screen on the
 * display, mirroring the app's Quick Look hover.
 */
export function Screenshots() {
  const [preview, setPreview] = useState<Shot | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const show = (img: Shot) => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setPreview(img)
  }
  const hide = () => {
    hideTimer.current = setTimeout(() => setPreview(null), 140)
  }

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

        <div className="shot-stage">
          <MacScreen className="macbook-static">
            <div className="mb-notch docked expanded shot-notch">
              <span className="notch-cam"></span>
              <div className="nx" onMouseLeave={hide}>
                <div className="nx-msg">
                  <Avatar name="Jurij" className="nx-avatar" />
                  <div className="nx-col">
                    <div className="nx-head">
                      <span className="nx-sender">Jurij</span>
                      <Globe className="nx-chan is-globe" strokeWidth={1.8} aria-hidden />
                      <span className="nx-sep">·</span>
                      <span className="nx-cdot" style={{ background: '#bf5af2' }} />
                      <span className="nx-circle">espresso-gang-03</span>
                    </div>
                    <div className="nx-album">
                      {ALBUM.map((img) => (
                        <span
                          key={img.id}
                          className="nx-thumb"
                          style={{ backgroundImage: img.grad }}
                          onMouseEnter={() => show(img)}
                        />
                      ))}
                    </div>
                    <div className="nx-text">how do you like these? 👀</div>
                  </div>
                </div>

                <div className="nx-history">
                  <div className="nx-rule" />
                  <div className="nx-row nx-row-img">
                    <span className="nx-rhead">
                      <span className="nx-rdot" style={{ background: '#0a84ff' }} />
                      <span className="nx-rsender">Sam</span>
                      <Globe className="nx-rchan is-globe" strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="nx-ralbum">
                      {HIST_ALBUM.map((img) => (
                        <span
                          key={img.id}
                          className="nx-rthumb"
                          style={{ backgroundImage: img.grad }}
                          onMouseEnter={() => show(img)}
                        />
                      ))}
                    </span>
                  </div>
                  <div className="nx-row">
                    <span className="nx-rhead">
                      <span className="nx-rdot" style={{ background: '#ff375f' }} />
                      <span className="nx-rsender">Taylor</span>
                      <Globe className="nx-rchan is-globe" strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="nx-rtext">ship it 🚀</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={`mb-preview${preview ? ' show' : ''}`} aria-hidden>
              {preview && <span className="mb-preview-img" style={{ backgroundImage: preview.grad }} />}
            </div>
          </MacScreen>
        </div>
      </div>
    </section>
  )
}
