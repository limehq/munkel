import { createFileRoute, redirect } from '@tanstack/react-router'

// Stable appcast URL on our domain; Sparkle follows the redirect to the latest release asset.
const APPCAST_TARGET =
  'https://github.com/limehq/munkel/releases/latest/download/appcast.xml'

export const Route = createFileRoute('/appcast.xml')({
  beforeLoad: () => {
    throw redirect({ href: APPCAST_TARGET, statusCode: 302 })
  },
})
