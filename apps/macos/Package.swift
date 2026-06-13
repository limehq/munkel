// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Munkel",
    platforms: [.macOS(.v14)],
    targets: [
        .target(name: "MunkelKit"),
        .executableTarget(
            name: "munkel",
            dependencies: ["MunkelKit"],
            path: "Sources/MunkelApp"
        ),
        .testTarget(
            name: "MunkelKitTests",
            dependencies: ["MunkelKit"]
        ),
    ]
)
