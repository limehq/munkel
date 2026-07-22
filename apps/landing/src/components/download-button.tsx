import { useRef, useState, type ReactNode } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { type VariantProps } from 'class-variance-authority'
import { usePostHog } from '@posthog/react'

import { Button, buttonVariants } from '@/components/ui/button'
import { DOWNLOAD_URL } from '@/lib/constants'

type DownloadButtonProps = VariantProps<typeof buttonVariants> & {
  location: string
  className?: string
  children?: ReactNode
  'aria-label'?: string
}

export function DownloadButton({
  location,
  variant = 'primary',
  size,
  className,
  children = 'Download for macOS',
  'aria-label': ariaLabel,
}: DownloadButtonProps) {
  const posthog = usePostHog()
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const start = () => {
    posthog?.capture('cta_download_clicked', { location })
    setLoading(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setLoading(false), 3000)
  }

  return (
    <Button asChild variant={variant} size={size} className={className}>
      <a href={DOWNLOAD_URL} onClick={start} aria-busy={loading} aria-label={ariaLabel}>
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
        {children}
      </a>
    </Button>
  )
}
