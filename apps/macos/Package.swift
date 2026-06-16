// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Munkel",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", from: "3.0.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.6.0"),
    ],
    targets: [
        .target(name: "MunkelKit"),
        .executableTarget(
            name: "munkel",
            dependencies: [
                "MunkelKit",
                .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts"),
                .product(name: "Sparkle", package: "Sparkle"),
            ],
            path: "Sources/MunkelApp"
            // No linkerSettings rpath: Sparkle ships as a binary framework that
            // Swift Bundler embeds in Contents/Frameworks/ and makes loadable by
            // adding an @executable_path rpath, which resolves Sparkle's
            // @rpath/../Frameworks/Sparkle.framework/… install name to
            // Contents/Frameworks/. Adding our own @executable_path here would just
            // duplicate that rpath (see make-bundle.sh / scripts/build-release.sh).
        ),
        .testTarget(
            name: "MunkelKitTests",
            dependencies: ["MunkelKit"]
        ),
    ]
)
