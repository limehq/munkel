import SwiftUI

/// The SwiftUI root hosted inside ``NotchPanelWindow``. Renders the caller's
/// `Content` either hugging the hardware notch (`notchBody`) or as a floating
/// pill on screens without one (`floatingBody`), and grows/shrinks it as the
/// panel's `state` flips. Expanded path only — Munkel never uses a compact state.
///
/// Capture invariant: `Content` is embedded DIRECTLY — never behind a lazy
/// `if`/`onAppear`/delayed-overlay branch — so the app's root `CaptureExclusion`
/// mounts in the same SwiftUI update pass the hosting view mounts, before any
/// content-bearing frame is composited. Do not wrap `owner.content` in a
/// conditional that defers its instantiation.
struct NotchHostingContent<Content: View>: View {
    @ObservedObject var owner: NotchPanel<Content>
    @State private var floatingHeight: CGFloat = 0
    /// Measured height of the notch/floating chrome, so the free-floating
    /// overlay (Quick-Look preview) can sit just below it without overlap.
    @State private var notchContentHeight: CGFloat = 0

    private let safeAreaInset: CGFloat = 15
    private let expandedTopCornerRadius: CGFloat = 15
    private let expandedBottomCornerRadius: CGFloat = 20
    private let floatingCornerRadius: CGFloat = 20
    /// Gap between the bottom of the notch chrome and the floating overlay.
    private let floatingOverlayGap: CGFloat = 14

    var body: some View {
        ZStack(alignment: .top) {
            if owner.hasNotch {
                notchBody
                    .foregroundStyle(.white)
            } else {
                floatingBody
            }
            // The app's free-floating overlay (Quick-Look image preview): a
            // sibling of the masked notch, so it escapes the NotchShape clip
            // yet stays inside this capture-excluded panel window. Positioned
            // just below the measured chrome; never intercepts clicks.
            if let overlay = owner.floatingOverlay, owner.state == .expanded {
                // Padding is outermost so the overlay is proposed only the room
                // BELOW the chrome — its GeometryReader then bounds the card to
                // what fits (no off-screen overflow). Never intercepts clicks.
                overlay
                    .allowsHitTesting(false)
                    .padding(.top, overlayTopClearance + floatingOverlayGap)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .shadow(
            color: .black.opacity(owner.state == .expanded ? 0.5 : 0),
            radius: owner.state == .hidden ? 0 : 10
        )
    }

    /// How far down the overlay must start to clear the notch (or floating pill).
    private var overlayTopClearance: CGFloat {
        owner.hasNotch ? notchContentHeight : floatingHeight + owner.notchSize.height
    }

    // MARK: - Notch

    private var minWidth: CGFloat { owner.notchSize.width + expandedTopCornerRadius * 2 }

    private var notchBody: some View {
        notchContent
            .background {
                Rectangle()
                    .foregroundStyle(.black)
                    // The opening/closing animation can overshoot — keep it black.
                    .padding(-50)
            }
            .mask {
                NotchShape(
                    topCornerRadius: expandedTopCornerRadius,
                    bottomCornerRadius: expandedBottomCornerRadius
                )
                .padding(.horizontal, 0.5)
                .frame(
                    width: owner.state != .hidden ? nil : minWidth,
                    height: owner.state != .hidden ? nil : owner.notchSize.height
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
    }

    /// `Content` pinned below the cutout via a top safe-area inset equal to the
    /// notch height — so the app can lift the avatar into the black strip with a
    /// negative overlay offset. `.onHover` covers the whole shape, cutout
    /// included, so hovering the physical notch registers (decision 2).
    private var notchContent: some View {
        HStack(spacing: 0) {
            if owner.state == .expanded {
                owner.content
                    .transition(
                        .contentBlur(10)
                            .combined(with: .verticalSquash(0.6, anchor: .top))
                            .combined(with: .opacity)
                    )
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) { Color.clear.frame(height: owner.notchSize.height) }
        .safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: safeAreaInset) }
        .safeAreaInset(edge: .leading, spacing: 0) { Color.clear.frame(width: safeAreaInset) }
        .safeAreaInset(edge: .trailing, spacing: 0) { Color.clear.frame(width: safeAreaInset) }
        .frame(minWidth: owner.notchSize.width)
        .padding(.horizontal, expandedTopCornerRadius)
        .fixedSize()
        .frame(minWidth: minWidth, minHeight: owner.notchSize.height)
        .onHover(perform: owner.updateHoverState)
        .background(
            GeometryReader { proxy in
                Color.clear
                    .onChange(of: proxy.size.height, initial: true) { _, height in
                        notchContentHeight = height
                    }
            }
        )
    }

    // MARK: - Floating (no-notch screens)

    private var floatingBody: some View {
        floatingContent
            .background {
                VisualEffectView(material: .popover, blendingMode: .behindWindow)
                    .overlay {
                        RoundedRectangle(cornerRadius: floatingCornerRadius, style: .continuous)
                            .strokeBorder(.quaternary, lineWidth: 1)
                    }
            }
            .clipShape(.rect(cornerRadius: floatingCornerRadius))
            .padding(20)
            .background(
                GeometryReader { proxy in
                    Color.clear
                        .onChange(of: proxy.size.height, initial: true) { _, height in
                            // Track height so the pill slides FULLY off the top
                            // edge before vanishing.
                            floatingHeight = height
                        }
                }
            )
            .offset(y: owner.state == .expanded ? owner.notchSize.height : -floatingHeight)
            .onHover(perform: owner.updateHoverState)
    }

    private var floatingContent: some View {
        VStack(spacing: 0) {
            owner.content
                .transition(.contentBlur(10).combined(with: .opacity))
                .safeAreaInset(edge: .top, spacing: 0) { Color.clear.frame(height: safeAreaInset) }
                .safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: safeAreaInset) }
                .safeAreaInset(edge: .leading, spacing: 0) { Color.clear.frame(width: safeAreaInset) }
                .safeAreaInset(edge: .trailing, spacing: 0) { Color.clear.frame(width: safeAreaInset) }
        }
        .fixedSize()
    }
}
