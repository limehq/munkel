import SwiftUI

/// The notch outline: a tab hanging from the top edge of the screen. The two
/// top corners curve *inward* (concave) so the tab blends out of the menu-bar
/// line; the two bottom corners are rounded *outward* (convex). Both radii are
/// animatable so the tab grows and shrinks smoothly as the notch opens/closes.
struct NotchShape: Shape {
    var topRadius: CGFloat
    var bottomRadius: CGFloat
    var cornerControlRatio: CGFloat = 0.75

    init(topCornerRadius: CGFloat, bottomCornerRadius: CGFloat) {
        self.topRadius = topCornerRadius
        self.bottomRadius = bottomCornerRadius
    }

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(topRadius, bottomRadius) }
        set { (topRadius, bottomRadius) = (newValue.first, newValue.second) }
    }

    func path(in rect: CGRect) -> Path {
        let leftWall = rect.minX + topRadius
        let rightWall = rect.maxX - topRadius
        let handle = bottomRadius * cornerControlRatio

        return Path { p in
            p.move(to: CGPoint(x: rect.minX, y: rect.minY))
            p.addQuadCurve(
                to: CGPoint(x: leftWall, y: rect.minY + topRadius),
                control: CGPoint(x: leftWall, y: rect.minY)
            )
            p.addLine(to: CGPoint(x: leftWall, y: rect.maxY - bottomRadius))
            p.addCurve(
                to: CGPoint(x: leftWall + bottomRadius, y: rect.maxY),
                control1: CGPoint(x: leftWall, y: rect.maxY - bottomRadius + handle),
                control2: CGPoint(x: leftWall + bottomRadius - handle, y: rect.maxY)
            )
            p.addLine(to: CGPoint(x: rightWall - bottomRadius, y: rect.maxY))
            p.addCurve(
                to: CGPoint(x: rightWall, y: rect.maxY - bottomRadius),
                control1: CGPoint(x: rightWall - bottomRadius + handle, y: rect.maxY),
                control2: CGPoint(x: rightWall, y: rect.maxY - bottomRadius + handle)
            )
            p.addLine(to: CGPoint(x: rightWall, y: rect.minY + topRadius))
            p.addQuadCurve(
                to: CGPoint(x: rect.maxX, y: rect.minY),
                control: CGPoint(x: rightWall, y: rect.minY)
            )
            p.closeSubpath()
        }
    }
}

/// Backdrop blur for the floating (no-notch) chrome. Wraps `NSVisualEffectView`.
struct VisualEffectView: NSViewRepresentable {
    let material: NSVisualEffectView.Material
    let blendingMode: NSVisualEffectView.BlendingMode

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = blendingMode
        view.state = .active
        view.isEmphasized = true
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}

// MARK: - Content enter/exit transitions

private struct ContentBlur: ViewModifier {
    var radius: CGFloat
    func body(content: Content) -> some View { content.blur(radius: radius) }
}

private struct VerticalSquash: ViewModifier {
    var factor: CGFloat
    var anchor: UnitPoint
    func body(content: Content) -> some View { content.scaleEffect(x: 1, y: factor, anchor: anchor) }
}

extension AnyTransition {
    /// Resolves a blur (radius → 0) as the content appears, and back as it leaves.
    static func contentBlur(_ radius: CGFloat) -> AnyTransition {
        .modifier(active: ContentBlur(radius: radius), identity: ContentBlur(radius: 0))
    }

    /// Squashes the content vertically toward `anchor` on insertion/removal.
    static func verticalSquash(_ factor: CGFloat, anchor: UnitPoint) -> AnyTransition {
        .modifier(
            active: VerticalSquash(factor: factor, anchor: anchor),
            identity: VerticalSquash(factor: 1, anchor: anchor)
        )
    }
}
