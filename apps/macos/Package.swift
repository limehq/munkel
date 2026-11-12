// swift-tools-version: 6.0
import Foundation
import PackageDescription

// The Mac App Store flavor (MUNKEL_MAS=1, set by make-bundle.sh's `mas` config)
// runs under the App Sandbox, which forbids a bundled self-updater. So Sparkle is
// dropped from the dependency graph entirely — not merely left unused — and the
// `MAS` compilation condition guards its call sites (see UpdaterController.swift).
let mas = ProcessInfo.processInfo.environment["MUNKEL_MAS"] == "1"

let sparkleDependencies: [Package.Dependency] = mas ? [] : [
    .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.6.0"),
]
let sparkleProduct: [Target.Dependency] = mas ? [] : [
    .product(name: "Sparkle", package: "Sparkle"),
]
let masSwiftSettings: [SwiftSetting] = mas ? [.define("MAS")] : []

let package = Package(
    name: "Munkel",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", from: "3.0.0"),
    ] + sparkleDependencies,
    targets: [
        .target(name: "MunkelKit"),
        .executableTarget(
            name: "munkel",
            dependencies: [
                "MunkelKit",
                .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts"),
            ] + sparkleProduct,
            path: "Sources/MunkelApp",
            resources: [.process("Resources")],
            swiftSettings: masSwiftSettings
        ),
        .testTarget(
            name: "MunkelKitTests",
            dependencies: ["MunkelKit"]
        ),
    ]
)
