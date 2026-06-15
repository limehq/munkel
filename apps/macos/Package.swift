// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Munkel",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", from: "3.0.0"),
    ],
    targets: [
        .target(name: "MunkelKit"),
        .executableTarget(
            name: "munkel",
            dependencies: [
                "MunkelKit",
                .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts"),
            ],
            path: "Sources/MunkelApp"
        ),
        .testTarget(
            name: "MunkelKitTests",
            dependencies: ["MunkelKit"]
        ),
    ]
)
