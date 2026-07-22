import { createFileRoute, redirect } from '@tanstack/react-router'

import { RELEASES_URL } from '@/lib/constants'
import { getLatestRelease } from '@/lib/release'

export const Route = createFileRoute('/download/latest')({
  beforeLoad: async () => {
    const release = await getLatestRelease()
    const dmg = release?.assets.find((asset) => asset.name.endsWith('.dmg'))
    throw redirect({ href: dmg?.browser_download_url ?? RELEASES_URL, statusCode: 302 })
  },
})
