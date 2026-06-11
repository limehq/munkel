// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "NotchPoC",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/MrKai77/DynamicNotchKit", from: "1.1.0"),
    ],
    targets: [
        .executableTarget(
            name: "notch-poc",
            dependencies: [
                .product(name: "DynamicNotchKit", package: "DynamicNotchKit"),
            ],
            path: "Sources/NotchPoC"
        ),
    ]
)
