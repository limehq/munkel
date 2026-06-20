import { ArrowRight, MonitorSmartphone } from 'lucide-react'

import { GITHUB_URL } from '@/lib/constants'

export function AnnounceBar() {
  return (
    <a
      className="announce"
      href={GITHUB_URL}
      aria-label="Munkel is going cross-platform — Windows support is coming soon"
    >
      <span className="announce-tag">Soon</span>
      <span className="announce-text">
        <MonitorSmartphone aria-hidden />
        Going cross-platform — <strong>Windows support</strong> is on the way.
      </span>
      <ArrowRight className="announce-arrow" aria-hidden />
    </a>
  )
}
