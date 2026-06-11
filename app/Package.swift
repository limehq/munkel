// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Fluesterung",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/MrKai77/DynamicNotchKit", from: "1.1.0"),
    ],
    targets: [
        .target(name: "FluesterungKit"),
        .executableTarget(
            name: "fluesterung",
            dependencies: [
                "FluesterungKit",
                .product(name: "DynamicNotchKit", package: "DynamicNotchKit"),
            ],
            path: "Sources/FluesterungApp"
        ),
        .executableTarget(
            name: "flustr",
            dependencies: ["FluesterungKit"],
            path: "Sources/Flustr"
        ),
        .testTarget(
            name: "FluesterungKitTests",
            dependencies: ["FluesterungKit"]
        ),
    ]
)
