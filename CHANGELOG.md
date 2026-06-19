# Changelog

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
