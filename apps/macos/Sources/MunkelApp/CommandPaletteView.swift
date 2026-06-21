import AppKit
import SwiftUI

/// Compact, app-like quick-send palette: circle sections with globe/avatar
/// target chips, a message field pinned at the bottom. ↑↓ or click picks the
/// target, typing composes, Return sends, Esc closes.
struct CommandPaletteView: View {
    @ObservedObject var model: AppModel
    @ObservedObject var state: CommandPaletteState
    let onClose: () -> Void
    /// Opens a file picker to attach an image from disk (owned by the
    /// presenter, which suppresses the palette's resign-key dismiss).
    let onPickFile: () -> Void

    @FocusState private var focused: Bool
    @State private var listHeight: CGFloat = 0

    private let width: CGFloat = 380
    private let maxListHeight: CGFloat = 360

    var body: some View {
        VStack(spacing: 0) {
            content
            Divider()
            composer
        }
        .frame(width: width)
        // Behind-window vibrancy like Spotlight (and the menu-bar popover),
        // instead of SwiftUI's flatter, grayer within-window .regularMaterial.
        .background(VisualEffectView(material: .popover, blendingMode: .behindWindow))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(.white.opacity(0.08), lineWidth: 1)
        )
        // Capture-proof root (backup to the panel's sharingType): the palette
        // shows circle codes, names and the draft.
        .excludedFromScreenCapture()
        .onAppear {
            // The panel is mid makeKey on first show; a synchronous focus
            // write is lost. Defer one tick — same trick as the notch reply.
            Task {
                try? await Task.sleep(for: .milliseconds(80))
                focused = true
            }
        }
        // Keep the selection in range when the list shrinks under it (a peer
        // leaving or logout mutates recipients with no user action).
        .onChange(of: state.recipients.count) { _, count in
            state.selectedIndex = min(state.selectedIndex, max(0, count - 1))
        }
    }

    @ViewBuilder
    private var content: some View {
        if state.recipients.isEmpty {
            Text(emptyMessage)
                .font(.callout)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 28)
                .padding(.horizontal, 16)
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(sections, id: \.circle) { section in
                            circleSection(section)
                        }
                    }
                    // Without full-width leading, the VStack shrinks to its
                    // widest row and the ScrollView centers it — which reads
                    // as a big left gap no padding can fix.
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 12)
                    .background(
                        GeometryReader { geo in
                            Color.clear.preference(key: ListHeightKey.self, value: geo.size.height)
                        }
                    )
                }
                // Height nil until measured: a 0 would collapse the list to
                // an invisible strip inside the preferredContentSize panel
                // (same trick as the in-app menu's circle list).
                .frame(height: listHeight == 0 ? nil : min(listHeight, maxListHeight))
                .onPreferenceChange(ListHeightKey.self) { listHeight = $0 }
                .onChange(of: state.selectedIndex) {
                    withAnimation(.easeOut(duration: 0.15)) {
                        proxy.scrollTo(state.selectedIndex, anchor: .center)
                    }
                }
            }
        }
    }

    private func circleSection(_ section: Section) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle()
                    .fill(model.session(for: section.circle)?.isConnected == true ? Color.green : Color.orange)
                    .frame(width: 7, height: 7)
                Text(section.circle)
                    .font(.system(.caption, design: .monospaced).weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            FlowLayout(spacing: 6) {
                ForEach(section.items, id: \.index) { item in
                    chip(item.recipient, index: item.index)
                        .id(item.index)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func chip(_ recipient: Recipient, index: Int) -> some View {
        let selected = index == state.selectedIndex
        return Button {
            state.selectedIndex = index
            focused = true
        } label: {
            HStack(spacing: 5) {
                if recipient.isEveryone {
                    Image(systemName: "globe")
                        .font(.system(size: 12))
                        .frame(width: 18, height: 18)
                } else {
                    AvatarView(name: recipient.label, imageData: recipient.avatar, size: 18, status: recipient.status)
                }
                Text(recipient.isEveryone ? "Everyone" : recipient.label)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
            }
            .padding(.leading, 4)
            .padding(.trailing, 9)
            .padding(.vertical, 4)
            .background(
                Capsule().fill(selected ? Color.accentColor.opacity(0.25) : Color.primary.opacity(0.06))
            )
            .overlay(
                Capsule().strokeBorder(Color.accentColor, lineWidth: selected ? 1.5 : 0)
            )
        }
        .buttonStyle(.plain)
        // Tab stays on the message field — chips are reached with arrows.
        .focusable(false)
        .animation(.spring(duration: 0.2), value: selected)
    }

    private var composer: some View {
        VStack(spacing: 0) {
            if !state.attachedImages.isEmpty {
                attachmentStrip
            }
            HStack(spacing: 10) {
                attachButton

                TextField(placeholder, text: $state.message)
                    .textFieldStyle(.plain)
                    .font(.system(size: 15))
                    // Single line that scrolls internally, clipped to its slot,
                    // so a long draft can't push the field editor past the box.
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .clipped()
                    .focused($focused)
                    .onSubmit(send)
                    .onExitCommand(perform: onClose)
                    .onChange(of: state.message) { _, new in
                        if new.count > MessageLimits.maxCharacters {
                            state.message = String(new.prefix(MessageLimits.maxCharacters))
                        }
                    }

                Button(action: send) {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 15))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.primary)
                .focusable(false)
                .disabled(!canSend)
            }
            .padding(.horizontal, 12)
            .frame(height: 48)
        }
    }

    /// Staged images as a row of thumbnails; click one to remove it.
    private var attachmentStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(state.attachedImages.enumerated()), id: \.offset) { index, data in
                    if let nsImage = NSImage(data: data) {
                        Button {
                            withAnimation(.spring(duration: 0.2)) { _ = state.attachedImages.remove(at: index) }
                            focused = true
                        } label: {
                            Image(nsImage: nsImage)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 38, height: 38)
                                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                                .overlay(alignment: .topTrailing) {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 12))
                                        .foregroundStyle(.white, .black.opacity(0.5))
                                        .padding(2)
                                }
                        }
                        .buttonStyle(.plain)
                        .help("Remove")
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
        }
    }

    /// Paperclip: upload image file(s) from disk (Slack-style). Pasting from
    /// the clipboard is ⌘V (handled by the presenter's key monitor).
    private var attachButton: some View {
        Button {
            onPickFile()
        } label: {
            Image(systemName: "paperclip")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .focusable(false)
        .disabled(!state.canAttachMore)
    }

    private var isEmpty: Bool {
        state.message.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Sendable when a target is picked and there's either a staged image or
    /// some text.
    private var canSend: Bool {
        guard state.selectedRecipient != nil else { return false }
        return !state.attachedImages.isEmpty || !isEmpty
    }

    private var placeholder: String {
        // Same prompt whether or not images are attached — typed text becomes
        // the caption when there are.
        guard let r = state.selectedRecipient else { return "Message…" }
        return r.isEveryone ? "Message everyone in \(r.circle)…" : "Message \(r.label)…"
    }

    private var emptyMessage: String {
        if model.githubUserLogin == nil {
            return "Sign in with GitHub to use Munkel."
        }
        return "Join a circle to send."
    }

    /// Recipients chunked back into per-circle sections, each item carrying
    /// its flat index (so chips stay in sync with ↑↓ / selectedIndex).
    private struct Section { let circle: String; var items: [(index: Int, recipient: Recipient)] }

    private var sections: [Section] {
        var result: [Section] = []
        for (index, recipient) in state.recipients.enumerated() {
            if result.last?.circle == recipient.circle {
                result[result.count - 1].items.append((index, recipient))
            } else {
                result.append(Section(circle: recipient.circle, items: [(index, recipient)]))
            }
        }
        return result
    }

    private func send() {
        guard let r = state.selectedRecipient else { return }
        if !state.attachedImages.isEmpty {
            // Any typed text rides along as the album's shared caption.
            let caption = state.message.trimmingCharacters(in: .whitespaces)
            model.send(images: state.attachedImages, caption: caption, group: r.circle, to: r.memberId)
            onClose()
            return
        }
        let text = state.message.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        model.send(text: text, group: r.circle, to: r.memberId)
        onClose()
    }
}

private struct ListHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

/// Minimal wrapping layout for the target chips — flows left-to-right and
/// wraps to the next line when a row is full.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var rowWidth: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0
        var totalWidth: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if rowWidth > 0, rowWidth + spacing + size.width > maxWidth {
                totalHeight += rowHeight + spacing
                totalWidth = max(totalWidth, rowWidth)
                rowWidth = size.width
                rowHeight = size.height
            } else {
                rowWidth += (rowWidth > 0 ? spacing : 0) + size.width
                rowHeight = max(rowHeight, size.height)
            }
        }
        totalHeight += rowHeight
        totalWidth = max(totalWidth, rowWidth)
        return CGSize(width: totalWidth, height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
