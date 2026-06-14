# Changelog

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
