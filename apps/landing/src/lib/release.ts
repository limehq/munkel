const LATEST_RELEASE_API = 'https://api.github.com/repos/limehq/munkel/releases/latest'

type CfInit = RequestInit & { cf?: { cacheTtl?: number; cacheEverything?: boolean } }

type Release = {
  tag_name: string
  assets: { name: string; browser_download_url: string }[]
}

export async function getLatestRelease(): Promise<Release | null> {
  try {
    const init: CfInit = {
      headers: { 'User-Agent': 'munkel-landing', Accept: 'application/vnd.github+json' },
      cf: { cacheTtl: 600, cacheEverything: true },
      signal: AbortSignal.timeout(3000),
    }
    const res = await fetch(LATEST_RELEASE_API, init)
    return res.ok ? ((await res.json()) as Release) : null
  } catch {
    return null
  }
}
