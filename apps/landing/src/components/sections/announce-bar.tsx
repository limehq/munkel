import { ArrowRight, MonitorSmartphone } from 'lucide-react'
import { usePostHog } from '@posthog/react'

import { GITHUB_URL } from '@/lib/constants'

export function AnnounceBar() {
  const posthog = usePostHog()
  return (
    <a
      className="announce"
      href={GITHUB_URL}
      aria-label="Munkel is coming to Windows soon"
      onClick={() => posthog?.capture('announce_windows_clicked')}
    >
      <span className="announce-tag">Soon</span>
      <span className="announce-text">
        <MonitorSmartphone aria-hidden />
        Windows is learning to munkel.
      </span>
      <ArrowRight className="announce-arrow" aria-hidden />
    </a>
  )
}
