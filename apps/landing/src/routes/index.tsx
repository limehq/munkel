import { createFileRoute } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'

import { AnnounceBar } from '@/components/sections/announce-bar'
import { Nav } from '@/components/sections/nav'
import { Hero } from '@/components/sections/hero'
import { HowItWorks } from '@/components/sections/how-it-works'
import { Features } from '@/components/sections/features'
import { Screenshots } from '@/components/sections/screenshots'
import { Cli } from '@/components/sections/cli'
import { Agents } from '@/components/sections/agents'
import { Privacy } from '@/components/sections/privacy'
import { Faq } from '@/components/sections/faq'
import { Cta } from '@/components/sections/cta'
import { LaunchBadgeTrack } from '@/components/sections/launch-badges'
import { SiteFooter } from '@/components/sections/site-footer'
import { getLatestRelease } from '@/lib/release'

export const Route = createFileRoute('/')({
  loader: async () => ({ version: (await getLatestRelease())?.tag_name ?? null }),
  component: LandingPage,
})

function LandingPage() {
  const { version } = Route.useLoaderData()
  return (
    <MotionConfig reducedMotion="user">
      <AnnounceBar />
      <Nav />
      <Hero version={version} />
      <HowItWorks />
      <Features />
      <Screenshots />
      <Cli />
      <Agents />
      <Privacy />
      <Faq />
      <LaunchBadgeTrack />
      <Cta />
      <SiteFooter />
    </MotionConfig>
  )
}
