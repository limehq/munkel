# Changelog

## [0.12.0](https://github.com/limehq/munkel/compare/v0.11.0...v0.12.0) (2026-06-22)


### Features

* **landing:** leaner, calmer copy rewrite ([#113](https://github.com/limehq/munkel/issues/113)) ([3e8eef8](https://github.com/limehq/munkel/commit/3e8eef86c8ca83ef949eeb2ec22651ce3ae8fec8))
* **macos:** english words for circle codes ([#119](https://github.com/limehq/munkel/issues/119)) ([56f9fab](https://github.com/limehq/munkel/commit/56f9fabc5458047aa6d7f93bc91ceeb4a3296b92))
* **macos:** full-screen centered image hover preview (current + history) ([#102](https://github.com/limehq/munkel/issues/102)) ([3108e13](https://github.com/limehq/munkel/commit/3108e1348b97e4d4c8a4278aa2b712db7511af6b))
* **macos:** keep animated gifs animated ([#124](https://github.com/limehq/munkel/issues/124)) ([4ecd6ad](https://github.com/limehq/munkel/commit/4ecd6ad8a88263ffeb51b6fab7d063c50eb9002a))
* **macos:** make urls in messages clickable ([#121](https://github.com/limehq/munkel/issues/121)) ([6826412](https://github.com/limehq/munkel/commit/6826412c920702f12ac9a4a46fe0cd04f6b698f1))
* **macos:** member presence modes — Online / Do Not Disturb / Away ([#111](https://github.com/limehq/munkel/issues/111)) ([4611af6](https://github.com/limehq/munkel/commit/4611af63421b47bc0d431e899905ac3bb11123a0))
* **macos:** morph notch into unread anchor ([#114](https://github.com/limehq/munkel/issues/114)) ([5183ffb](https://github.com/limehq/munkel/commit/5183ffb90a654f82c49d2d4ad766541b7ff4adcd))
* **macos:** rename circles to channels ([#125](https://github.com/limehq/munkel/issues/125)) ([2877173](https://github.com/limehq/munkel/commit/28771732099c8cbf4f98f2a793aef1c0711517df))
* **macos:** send image url as a real image ([#120](https://github.com/limehq/munkel/issues/120)) ([dd80d04](https://github.com/limehq/munkel/commit/dd80d047120259f17a786a97572805d081bc4f71))
* **macos:** show link previews in messages ([#123](https://github.com/limehq/munkel/issues/123)) ([f1d23a0](https://github.com/limehq/munkel/commit/f1d23a02db408d8949fae18fb2a2614e3f811346))


### Bug Fixes

* **landing:** wrap footer links on mobile to prevent overflow ([#110](https://github.com/limehq/munkel/issues/110)) ([7575574](https://github.com/limehq/munkel/commit/75755745edf87bb4a89272db68db07ea20cdb1a3))
* **macos:** bound notch history image cache to the 60s ephemerality window ([#118](https://github.com/limehq/munkel/issues/118)) ([1487e80](https://github.com/limehq/munkel/commit/1487e8076b3adf94fda88b75b7adf7e0d78e57af)), closes [#94](https://github.com/limehq/munkel/issues/94)
* **macos:** clear reply draft after sending ([#132](https://github.com/limehq/munkel/issues/132)) ([719ac52](https://github.com/limehq/munkel/commit/719ac528f3df809577122ea03de944fe19bfb446))
* **macos:** expand main message to full height ([#133](https://github.com/limehq/munkel/issues/133)) ([e88460d](https://github.com/limehq/munkel/commit/e88460d8a00a06a277cc9e5b4a50c6f7adcd5f66))
* **macos:** keep the full-screen image preview clear of the notch ([#126](https://github.com/limehq/munkel/issues/126)) ([368e6e1](https://github.com/limehq/munkel/commit/368e6e1422ceffd6df7ae46d7b73d20f622f2a74))
* **macos:** paste and edit keys in all inputs ([#131](https://github.com/limehq/munkel/issues/131)) ([5349349](https://github.com/limehq/munkel/commit/5349349d86d65dadeb75ddb87b40826b292d6a80))
* **macos:** paste, select all, emoji in inputs ([#122](https://github.com/limehq/munkel/issues/122)) ([791a2be](https://github.com/limehq/munkel/commit/791a2be37594fc7d91516a9fe7ca8e20d20a4778))
* **macos:** stop caching fetched image-url bytes to disk ([#128](https://github.com/limehq/munkel/issues/128)) ([74839f5](https://github.com/limehq/munkel/commit/74839f53ffd965577a7301947a7b4ee38c37a499))
* **server:** drive dev-send profile status from PRESENCE, not STATUS ([#127](https://github.com/limehq/munkel/issues/127)) ([ac0c335](https://github.com/limehq/munkel/commit/ac0c335d09ee1d63d38cae20ba86625aa11b06df))

## [0.11.0](https://github.com/limehq/munkel/compare/v0.10.0...v0.11.0) (2026-06-20)


### Features

* **landing:** warm meerkat theme + app icon throughout ([#90](https://github.com/limehq/munkel/issues/90)) ([8787edd](https://github.com/limehq/munkel/commit/8787edd7ad4f92cae44a99afc07df04a873f9c43))
* **macos:** app icon + Munkel glyph in menu bar/popover ([#76](https://github.com/limehq/munkel/issues/76)) ([556c766](https://github.com/limehq/munkel/commit/556c7661999ffcb8f019dd6fc06d131c6ab4746f))
* **macos:** attach images to inline notch reply ([#88](https://github.com/limehq/munkel/issues/88)) ([787b402](https://github.com/limehq/munkel/commit/787b4022464b1632c3a1ea7da465898fea558d2b)), closes [#68](https://github.com/limehq/munkel/issues/68)
* **macos:** free-floating Quick Look hover preview for album images ([#84](https://github.com/limehq/munkel/issues/84)) ([c7f5410](https://github.com/limehq/munkel/commit/c7f5410a328f8c66262b6e571081c818c42d38e0)), closes [#69](https://github.com/limehq/munkel/issues/69)
* **macos:** notch display picker, ⌥M quick-send default, Launch-at-Login fix ([#95](https://github.com/limehq/munkel/issues/95)) ([5eb723e](https://github.com/limehq/munkel/commit/5eb723e16a3266c2f4ac3105e874985b7e4efd4e))
* **macos:** per-image and per-message copy controls in the notch ([#86](https://github.com/limehq/munkel/issues/86)) ([ab53a05](https://github.com/limehq/munkel/commit/ab53a0543c058bd41dc00bf3a9b6ba1daa68f997)), closes [#71](https://github.com/limehq/munkel/issues/71)
* **macos:** render past image messages in the expanded notch history ([#93](https://github.com/limehq/munkel/issues/93)) ([ea39d17](https://github.com/limehq/munkel/commit/ea39d17cd611f7dc1a928cc4dcec5228c98b8c58))


### Bug Fixes

* **macos:** harden auth-code notch (review follow-ups) ([#87](https://github.com/limehq/munkel/issues/87)) ([6e50de5](https://github.com/limehq/munkel/commit/6e50de5e3663fa67ab76dd0cf64941b400ee06bc))
* **macos:** keep GitHub sign-in code visible in the notch ([#85](https://github.com/limehq/munkel/issues/85)) ([63b49ae](https://github.com/limehq/munkel/commit/63b49ae80f1ad49115ae864b16ef9c7818a2a3be))
* **macos:** keep the notch reply alive while the image picker is open ([#91](https://github.com/limehq/munkel/issues/91)) ([8773570](https://github.com/limehq/munkel/commit/87735702888222940e728721bf0f42eaf3fe3834))
* **macos:** notch image thumbnails — per-image copy, layout & hover fixes ([#92](https://github.com/limehq/munkel/issues/92)) ([4bea7b9](https://github.com/limehq/munkel/commit/4bea7b9afebcdbb6a6281620f69e50720ddaf658))
* **macos:** pack ~4 album thumbnails per row in the notch ([#82](https://github.com/limehq/munkel/issues/82)) ([ade1300](https://github.com/limehq/munkel/commit/ade13005ec846ddcb9700f892b8f9e42c786f3c9)), closes [#67](https://github.com/limehq/munkel/issues/67)

## [0.10.0](https://github.com/limehq/munkel/compare/v0.9.0...v0.10.0) (2026-06-19)


### Features

* add Tab navigation to cycle through recipients in command palette ([#64](https://github.com/limehq/munkel/issues/64)) ([67b5aa0](https://github.com/limehq/munkel/commit/67b5aa026c20e5a785c3dbe9bc95a70466db389c))
* image sharing with inline AVIF preview and lazy R2 full-res ([#74](https://github.com/limehq/munkel/issues/74)) ([6639ac0](https://github.com/limehq/munkel/commit/6639ac0dcaad7b7f9aaa2821fafad9985b33cd22))
* **landing:** add Imprint, Privacy & Contact legal pages ([#78](https://github.com/limehq/munkel/issues/78)) ([2a17690](https://github.com/limehq/munkel/commit/2a1769078ab6c3b18c90f21668c691a6d7d82050)), closes [#73](https://github.com/limehq/munkel/issues/73)
* **landing:** notch hover cue + macOS menu bar, fix top hairline ([#79](https://github.com/limehq/munkel/issues/79)) ([e965ea4](https://github.com/limehq/munkel/commit/e965ea48fe82d5d64c6ad93907191df0e381a6b5))
* **macos:** add unread message indicator in notch ([#77](https://github.com/limehq/munkel/issues/77)) ([db72608](https://github.com/limehq/munkel/commit/db726087fd3c88c44fd53c842367ba3cd06751a3))
* **macos:** copy history messages via hover button and "C" shortcut ([623584b](https://github.com/limehq/munkel/commit/623584b53362db1bbba47ce5c019fae294a81fac))
* **macos:** copy history messages via hover button and "C" shortcut ([ed6df91](https://github.com/limehq/munkel/commit/ed6df91345dd6d6c6439d9fdeddb50e3cbc198a5))
* show lock/globe icon in collapsed message teaser ([#63](https://github.com/limehq/munkel/issues/63)) ([4fb00fd](https://github.com/limehq/munkel/commit/4fb00fd1619506470a97405935ceace4c200ca09))


### Bug Fixes

* **macos:** let hover-"C" copy the current message too ([0ebe322](https://github.com/limehq/munkel/commit/0ebe322f8c4f62ecaaaebab9529347658c5fd2c7))

## [0.9.0](https://github.com/limehq/munkel/compare/v0.8.4...v0.9.0) (2026-06-17)


### Features

* one-call `munkel dm` for agents, app residency, reply timeout ([#61](https://github.com/limehq/munkel/issues/61)) ([6fd2fb2](https://github.com/limehq/munkel/commit/6fd2fb2bda4f650d02faa2a71c40462c26ec4a69))

## [0.8.4](https://github.com/limehq/munkel/compare/v0.8.3...v0.8.4) (2026-06-17)


### Bug Fixes

* **release:** stop build-brew-cask.sh executing backticks in the cask template ([#59](https://github.com/limehq/munkel/issues/59)) ([86410d6](https://github.com/limehq/munkel/commit/86410d6fe7a3a293e4a3787be950af0b7e019e8a))

## [0.8.3](https://github.com/limehq/munkel/compare/v0.8.2...v0.8.3) (2026-06-17)


### Bug Fixes

* **release:** show the changelog inline in the Sparkle update dialog ([#57](https://github.com/limehq/munkel/issues/57)) ([d043c31](https://github.com/limehq/munkel/commit/d043c314ab3cf866696579f150eaa8653c9f19dd))

## [0.8.2](https://github.com/limehq/munkel/compare/v0.8.1...v0.8.2) (2026-06-17)


### Documentation

* **releasing:** document Release-As for forcing a version ([#55](https://github.com/limehq/munkel/issues/55)) ([d631913](https://github.com/limehq/munkel/commit/d6319131bcd6c9299357f485e3ee0f0cd792aed1))

## [0.8.1](https://github.com/limehq/munkel/compare/v0.8.0...v0.8.1) (2026-06-16)


### Bug Fixes

* make build-appcast.sh executable ([#53](https://github.com/limehq/munkel/issues/53)) ([4212913](https://github.com/limehq/munkel/commit/4212913be10ca36219990b7e686b486e8c850bc6))

## [0.8.0](https://github.com/limehq/munkel/compare/v0.7.0...v0.8.0) (2026-06-16)


### Features

* **macos:** enable Sparkle auto-updates ([#52](https://github.com/limehq/munkel/issues/52)) ([6cff5d9](https://github.com/limehq/munkel/commit/6cff5d914b699ccd3ba33df93b0fdc1d758bf5d5)), closes [#36](https://github.com/limehq/munkel/issues/36)


### Bug Fixes

* **macos:** force -Onone for release builds to dodge swift[#88173](https://github.com/limehq/munkel/issues/88173) ([946c7a3](https://github.com/limehq/munkel/commit/946c7a39772976f57001a09dffc4a26a9c64c265))
* **macos:** unblock release build — work around swift[#88173](https://github.com/limehq/munkel/issues/88173) inliner crash ([e742817](https://github.com/limehq/munkel/commit/e742817371e60495fa8ea7a0b1ae951aaed43182))

## [0.7.0](https://github.com/limehq/munkel/compare/v0.6.0...v0.7.0) (2026-06-15)


### Features

* **cli:** target the parallel "Munkel Dev" app ([0e3233d](https://github.com/limehq/munkel/commit/0e3233d47cca125d8ab9b492320e3a7132be15db))
* **cli:** target the parallel "Munkel Dev" app ([8507f01](https://github.com/limehq/munkel/commit/8507f01278ffdf40ec955298fbbf5c0067636ab8))
* **landing:** redesign sections, shadcn refactor, Framer Motion scroll ([8ff67e8](https://github.com/limehq/munkel/commit/8ff67e8e59200704451de4e8d63ac400924b4482))
* **landing:** redesign sections, shadcn refactor, Framer Motion scroll ([26dcd4d](https://github.com/limehq/munkel/commit/26dcd4df320393f5992967ef740f0be79d54ecab))
* **macos:** Munkel Dev build variant, no-admin CLI install, capture exclusion ([0f795a8](https://github.com/limehq/munkel/commit/0f795a8109c7658016a7e632d9495d554f90febf))
* **macos:** Munkel Dev variant, no-admin CLI install, capture exclusion ([37d13bf](https://github.com/limehq/munkel/commit/37d13bfb8c54e456b3585cb2e70cea43fd425dc3))
* **macos:** UI polish + message cap (issues [#31](https://github.com/limehq/munkel/issues/31),33,34,35,37,38) ([#40](https://github.com/limehq/munkel/issues/40)) ([6fac32c](https://github.com/limehq/munkel/commit/6fac32cd81c9f0be2f7d41ce2fbedd06faa0bdb1))

## [0.6.0](https://github.com/limehq/munkel/compare/v0.5.0...v0.6.0) (2026-06-15)


### Features

* **macos:** rework recipient picking + UI polish ([#29](https://github.com/limehq/munkel/issues/29)) ([ab2472c](https://github.com/limehq/munkel/commit/ab2472c22ef3761a0703d844ee24f51255b4309f))

## [0.5.0](https://github.com/limehq/munkel/compare/v0.4.2...v0.5.0) (2026-06-15)


### Features

* **release:** embed CLI in app bundle, ship a DMG download ([#25](https://github.com/limehq/munkel/issues/25)) ([c08940e](https://github.com/limehq/munkel/commit/c08940e938e7fe5fc368527588683db0e7fb82bb))

## [0.4.2](https://github.com/limehq/munkel/compare/v0.4.1...v0.4.2) (2026-06-14)


### Bug Fixes

* **macos:** bundle SwiftPM resources into the .app ([#22](https://github.com/limehq/munkel/issues/22)) ([af1ccd9](https://github.com/limehq/munkel/commit/af1ccd96ebebd21a991e98e237bbf7cef61db265))

## [0.4.1](https://github.com/limehq/munkel/compare/v0.4.0...v0.4.1) (2026-06-14)


### Bug Fixes

* **macos:** activate app before showing the menu-bar popover ([#20](https://github.com/limehq/munkel/issues/20)) ([b667674](https://github.com/limehq/munkel/commit/b66767427224988c31f4dc512046efd6449cb703))

## [0.4.0](https://github.com/limehq/munkel/compare/v0.3.0...v0.4.0) (2026-06-13)


### Features

* **cli:** auto-start the Munkel app when its socket is down ([#17](https://github.com/limehq/munkel/issues/17)) ([d7b71f3](https://github.com/limehq/munkel/commit/d7b71f351bba5c96c99ac82a0130ce6c75fbec50))

## [0.3.0](https://github.com/limehq/munkel/compare/v0.2.0...v0.3.0) (2026-06-13)


### Features

* landing announce bar, munkel terminology, and notch dev simulator ([#15](https://github.com/limehq/munkel/issues/15)) ([23f6d85](https://github.com/limehq/munkel/commit/23f6d85bbda2ba3de9fff7838a7a30be2c662444))

## [0.2.0](https://github.com/limehq/munkel/compare/v0.1.0...v0.2.0) (2026-06-13)


### Features

* add quick-send command palette (global hotkey) ([#10](https://github.com/limehq/munkel/issues/10)) ([e76b83b](https://github.com/limehq/munkel/commit/e76b83bd77d4628f682919f9b061ef46ea18ce2c))

## 0.1.0 (2026-06-13)


### Features

* 60s notch history with live push, group color markers, refined click targets ([0b0c231](https://github.com/limehq/munkel/commit/0b0c23185298117ed72e5abb248f2a26838015f6))
* automated releases — signed, notarized Homebrew cask pipeline ([b64f22e](https://github.com/limehq/munkel/commit/b64f22ed1e2b27cd44b8aa03f2f38ce23871bf4b))
* avatar entrance animation — spring pop from notch with pulse ring ([62683c9](https://github.com/limehq/munkel/commit/62683c90d3c8bd30db51701b9b538ca7a68d6032))
* avatar sits beside the hardware notch, teaser text below ([290ae96](https://github.com/limehq/munkel/commit/290ae962a27394c17aab73afa0f9edc90f5252ec))
* click anywhere on the message to copy it ([9d0d544](https://github.com/limehq/munkel/commit/9d0d544984d605c7fdbd6645173075a63317ede1))
* compact message ticker right of notch, slower entrance ([93bb988](https://github.com/limehq/munkel/commit/93bb9880c9c00cd99f343829089a0a8422e16634))
* Durable Objects relay server (Hono + partyserver) ([bababb6](https://github.com/limehq/munkel/commit/bababb691d3c35f1f0f62766be104cf1d46104bf))
* exclude notch and menu popover from screen capture ([58b1e89](https://github.com/limehq/munkel/commit/58b1e8918f2a7f71342df105708d0c7e8b4e25d2))
* flustr CLI over unix control socket; app defaults to deployed relay ([c40d91f](https://github.com/limehq/munkel/commit/c40d91f5d06b1135e50eea95f9a3fdecba5a0cd7))
* hover-to-expand menu under the notch ([3144c46](https://github.com/limehq/munkel/commit/3144c466ec87d98877a4cd9374d28accb25e4f8b))
* landing page with auto-deploy to Cloudflare via GitHub Actions ([1baa186](https://github.com/limehq/munkel/commit/1baa18630afd085216a3a9d69466f38f83527f83))
* **landing:** implement Munkel landing from design handoff ([ca25cdd](https://github.com/limehq/munkel/commit/ca25cdd895514d77984ad7f95abdea540c71f53d))
* login with GitHub — username + avatar via device flow ([366fd7d](https://github.com/limehq/munkel/commit/366fd7dcf71838b3bf99887dd8535d00dc3ba87e))
* macOS menu-bar app with E2E-encrypted messaging and notch display ([16da961](https://github.com/limehq/munkel/commit/16da9616fb60ced7b1739640e27f31d6ef1b171b))
* notch message PoC with DynamicNotchKit ([6502ac3](https://github.com/limehq/munkel/commit/6502ac389236564d1a6315327f5a5ea627fd5e9c))
* notch reply with channel toggle, mandatory GitHub login, popover menu ([7169011](https://github.com/limehq/munkel/commit/7169011ede1c0018e9dd3c2eef8862ff03640c4c))
* teaser layout — avatar top-left, text starts below it ([02b56a2](https://github.com/limehq/munkel/commit/02b56a2660ae84ae998e462556294e025ae1aa0c))
* teaser line below the notch — single scroll-through, hover morphs to full view ([0df18f0](https://github.com/limehq/munkel/commit/0df18f018ad6dbbc36d20e8b38b7978a6b41c059))
* truncate ticker text to a 48-char preview ([d4e466b](https://github.com/limehq/munkel/commit/d4e466b30305f0fffceec19f2f464f50bb0b3631))
* unobtrusive notch display — compact avatar, expand on hover ([fb462c7](https://github.com/limehq/munkel/commit/fb462c714a02089ac0290a98fb46bfcb44208237))


### Bug Fixes

* align teaser text under the avatar, tighten vertical spacing ([bc725e5](https://github.com/limehq/munkel/commit/bc725e5ebe0a7f8723be02b71da7a156c1520184))
* avoid stretching the notch shape to full panel width ([f34f997](https://github.com/limehq/munkel/commit/f34f99781faa8f5732184959e0978db653fa206e))
* click-to-copy hit area covers the entire notch shape ([27a9d85](https://github.com/limehq/munkel/commit/27a9d85b3c7c394017eebb22b311693895c29df9))
* first click copies — AppKit event monitor instead of tap gesture ([7a60f7b](https://github.com/limehq/munkel/commit/7a60f7b5982eabd033999f3b2cd36f584b79f71d))
* hover expansion keeps teaser width, grows only downward ([a069375](https://github.com/limehq/munkel/commit/a06937510a257e0110e8e19c7e60b862ab083380))
* readable ticker start; feat: persistent copy button right of notch ([834bf99](https://github.com/limehq/munkel/commit/834bf990a00658fab8f796d795c18746168a10bd))
* reserve final ticker width during measurement frame ([e618098](https://github.com/limehq/munkel/commit/e61809823353d41c95877b3e1fb333aeb4fd8249))
* scroll overshoots the trailing fade so the text end is fully readable ([7af3b26](https://github.com/limehq/munkel/commit/7af3b26b6550aa8e25287841b55bb21a6dde51b4))
* ticker scrolls the full text to its real end ([5631413](https://github.com/limehq/munkel/commit/5631413b72f77ce8e30b055e2abf9d21c9430dd5))
* top-align avatar in hover-expanded view ([697548a](https://github.com/limehq/munkel/commit/697548afd56ba7e24082a8d95bc1b6f675f923b4))
