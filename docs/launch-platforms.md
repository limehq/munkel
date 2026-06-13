# Launch platforms

Single source of truth for **where Munkel launches** and which launch badges
we collect. Tracks status per platform so the landing-page badge track
(`apps/landing` → `LAUNCH_PLATFORMS`) and the launch effort stay in sync.

Related: issue [#8](https://github.com/limehq/munkel/issues/8).

## How this maps to the code

`LAUNCH_PLATFORMS` in `apps/landing/src/routes/index.tsx` mirrors the **live**
rows below. Until a platform is live, its badge renders in-house
("Launching on …"). When it goes live:

1. Flip `Status` to ✅ here and fill in **Listing URL** + **Badge** + **Link rel**.
2. In the code, set `live: true`, point `href` at the listing URL, and drop the
   platform's official badge into `img` (self-hosted under
   `apps/landing/public/badges/`, never hot-linked).

## Status legend

- 📋 **planned** — on the list, not submitted yet
- 🚀 **submitted** — submitted / scheduled, awaiting listing or launch day
- ✅ **live** — listed; badge earned and (where applicable) on the site

## ⚠️ Verify before trusting a row

Homepage URLs, badge availability, and link `rel` (dofollow vs nofollow) are
**best-effort and unverified**. Confirm each on the platform itself before
adding its badge to the track — `_TBD_` marks anything not yet checked.

## Tier 1 — flagship (schedule deliberately)

| Platform | Homepage | Listing URL | Badge | Link rel | Status | Notes |
|---|---|---|---|---|---|---|
| Product Hunt | https://www.producthunt.com | _TBD_ | _TBD_ | _TBD_ | 📋 | Pick a date; line up hunter + upvotes. The big one. |
| Peerlist Launchpad | https://peerlist.io | _TBD_ | _TBD_ | _TBD_ | 📋 | Strong with the builder/dev audience; longer visibility window. |
| Fazier | https://fazier.com | _TBD_ | _TBD_ | _TBD_ | 📋 | Clean, AI-startup friendly, less crowded. Offers a badge. |
| Uneed | https://www.uneed.best | _TBD_ | _TBD_ | _TBD_ | 📋 | Curated directory; badge available. |

## Tier 2 — solid directories with badges

| Platform | Homepage | Listing URL | Badge | Link rel | Status | Notes |
|---|---|---|---|---|---|---|
| MicroLaunch | https://microlaunch.net | _TBD_ | _TBD_ | _TBD_ | 📋 | |
| Startup Fame | https://startupfa.me | _TBD_ | _TBD_ | _TBD_ | 📋 | |
| Twelve Tools | https://twelve.tools | _TBD_ | _TBD_ | _TBD_ | 📋 | |
| Findly.tools | https://findly.tools | _TBD_ | _TBD_ | _TBD_ | 📋 | |
| LaunchIgniter | https://launchigniter.com | _TBD_ | _TBD_ | _TBD_ | 📋 | |
| Tiny Launch / Smol Launch | _TBD_ | _TBD_ | _TBD_ | _TBD_ | 📋 | Confirm which one; domains overlap. |
| OpenHunts | _TBD_ | _TBD_ | _TBD_ | _TBD_ | 📋 | getwring shows an "OpenHunts Club Member" badge. |
| Dang.ai | https://dang.ai | _TBD_ | _TBD_ | _TBD_ | 📋 | AI-tool directory. |

## Tier 3 — long tail

Mostly the set getwring.app uses, plus classic directories. Low effort each;
batch-submit.

| Platform | Homepage | Listing URL | Badge | Link rel | Status | Notes |
|---|---|---|---|---|---|---|
| FoundrList | _TBD_ | _TBD_ | _TBD_ | _TBD_ | 📋 | |
| BuildHop | _TBD_ | _TBD_ | _TBD_ | _TBD_ | 📋 | "Trending on BuildHop" badge. |
| Orynth | _TBD_ | _TBD_ | _TBD_ | _TBD_ | 📋 | |
| SubmitMySaaS | _TBD_ | _TBD_ | _TBD_ | _TBD_ | 📋 | |
| Toshi List | _TBD_ | _TBD_ | _TBD_ | _TBD_ | 📋 | |
| LaunchPanda | _TBD_ | _TBD_ | _TBD_ | _TBD_ | 📋 | "Launched on LaunchPanda" badge. |
| Huzzler | _TBD_ | _TBD_ | _TBD_ | _TBD_ | 📋 | |
| BetaList | https://betalist.com | _TBD_ | _TBD_ | _TBD_ | 📋 | Classic; pre-launch / early-stage audience. |
| Launching Next | https://www.launchingnext.com | _TBD_ | _TBD_ | _TBD_ | 📋 | Classic startup directory. |

## Sources for more directories

- [awesome-saas-directories](https://github.com/mahseema/awesome-saas-directories) — curated, aggregated list
- [getwring.app](https://getwring.app/) — the badge track that inspired this
