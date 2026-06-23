import { useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DOWNLOAD_URL } from '@/lib/constants'

export function DownloadButton() {
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const start = () => {
    setLoading(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setLoading(false), 3000)
  }

  return (
    <Button asChild variant="primary">
      <a href={DOWNLOAD_URL} onClick={start} aria-busy={loading}>
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
        Download for macOS
      </a>
    </Button>
  )
}
