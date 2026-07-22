import { type ReactNode } from 'react'
import { Star } from 'lucide-react'
import { type VariantProps } from 'class-variance-authority'
import { usePostHog } from '@posthog/react'

import { Button, buttonVariants } from '@/components/ui/button'
import { GITHUB_URL } from '@/lib/constants'

type GithubButtonProps = VariantProps<typeof buttonVariants> & {
  location: string
  className?: string
  children?: ReactNode
}

export function GithubButton({
  location,
  variant = 'outline',
  size,
  className,
  children = 'Star on GitHub',
}: GithubButtonProps) {
  const posthog = usePostHog()

  return (
    <Button asChild variant={variant} size={size} className={className}>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => posthog?.capture('cta_github_clicked', { location })}
      >
        <Star aria-hidden />
        {children}
      </a>
    </Button>
  )
}
