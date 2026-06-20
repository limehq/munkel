import { ArrowRight, MonitorSmartphone } from 'lucide-react'

import { GITHUB_URL } from '@/lib/constants'

export function AnnounceBar() {
  return (
    <a
      className="announce"
      href={GITHUB_URL}
      aria-label="Munkel is coming to Windows soon"
    >
      <span className="announce-tag">Soon</span>
      <span className="announce-text">
        <MonitorSmartphone aria-hidden />
        <strong>Windows</strong> is learning to munkel.
      </span>
      <ArrowRight className="announce-arrow" aria-hidden />
    </a>
  )
}
