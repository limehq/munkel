import SwiftUI

/// The notch outline — a flat-topped tongue with rounded inner corners.
/// `animatableData` lets the corner radii animate as the notch opens and closes.
struct NotchShape: Shape {
    private var topCornerRadius: CGFloat
    private var bottomCornerRadius: CGFloat

    init(topCornerRadius: CGFloat, bottomCornerRadius: CGFloat) {
        self.topCornerRadius = topCornerRadius
        self.bottomCornerRadius = bottomCornerRadius
    }

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { .init(topCornerRadius, bottomCornerRadius) }
        set {
            topCornerRadius = newValue.first
            bottomCornerRadius = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addQuadCurve(
            to: CGPoint(x: rect.minX + topCornerRadius, y: rect.minY + topCornerRadius),
            control: CGPoint(x: rect.minX + topCornerRadius, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: rect.minX + topCornerRadius, y: rect.maxY - bottomCornerRadius))
        path.addQuadCurve(
            to: CGPoint(x: rect.minX + topCornerRadius + bottomCornerRadius, y: rect.maxY),
            control: CGPoint(x: rect.minX + topCornerRadius, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.maxX - topCornerRadius - bottomCornerRadius, y: rect.maxY))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX - topCornerRadius, y: rect.maxY - bottomCornerRadius),
            control: CGPoint(x: rect.maxX - topCornerRadius, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.maxX - topCornerRadius, y: rect.minY + topCornerRadius))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.minY),
            control: CGPoint(x: rect.maxX - topCornerRadius, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
        return path
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

private struct BlurModifier: ViewModifier {
    let intensity: CGFloat
    func body(content: Content) -> some View { content.blur(radius: intensity) }
}

private struct ScaleModifier: ViewModifier {
    let xScale: CGFloat
    let yScale: CGFloat
    let anchor: UnitPoint
    func body(content: Content) -> some View {
        content.scaleEffect(x: xScale, y: yScale, anchor: anchor)
    }
}

extension AnyTransition {
    /// Blurs the content in/out (radius animates from `intensity` to 0).
    static func blur(intensity: CGFloat) -> AnyTransition {
        .modifier(active: BlurModifier(intensity: intensity), identity: BlurModifier(intensity: 0))
    }

    /// Scales the content in/out around `anchor`.
    static func scale(x: CGFloat = 1, y: CGFloat = 1, anchor: UnitPoint = .center) -> AnyTransition {
        .modifier(
            active: ScaleModifier(xScale: x, yScale: y, anchor: anchor),
            identity: ScaleModifier(xScale: 1, yScale: 1, anchor: anchor)
        )
    }
}
