import AppKit
import KeyboardShortcuts
import MunkelKit
import SwiftUI

struct MenuView: View {
    @EnvironmentObject private var model: AppModel
    @State private var joinCode = ""
    @State private var userCodeCopied = false
    @State private var groupListHeight: CGFloat = 0
    @StateObject private var displayList = DisplayList()
    /// "Launch at Login" state that reflects intent immediately and reconciles
    /// with the real SMAppService status on foreground.
    @StateObject private var loginItem = LoginItemModel()
    /// Empty = automatic (active display); otherwise a display's stable UUID.
    @AppStorage(DisplayPreference.key) private var preferredDisplayID = ""
    #if DEBUG
    @AppStorage("devEchoBroadcasts") private var devEchoBroadcasts = true
    @AppStorage(CaptureScreenshotPreference.defaultsKey) private var allowInScreenshots = false
    #endif

    private let maxGroupListHeight: CGFloat = 400

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header

            if model.githubUserLogin == nil {
                Text("Sign in with GitHub to use Munkel.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    // Without this the popup truncates to one ellipsized
                    // line instead of wrapping.
                    .fixedSize(horizontal: false, vertical: true)

                githubArea
            } else {
                if model.groupCodes.isEmpty {
                    Text("No circles yet. Create one or join with a code.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        // Without this the popup truncates to one ellipsized
                        // line instead of wrapping.
                        .fixedSize(horizontal: false, vertical: true)
                }

                // Scrolls once the group list outgrows the cap. A bare
                // maxHeight does not work here: ScrollView has no ideal
                // height of its own and collapses to zero in this
                // ideal-sized popup — so the content height is measured
                // and applied explicitly.
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(model.groupCodes, id: \.self) { code in
                            GroupSectionView(code: code)
                        }
                    }
                    .background(
                        GeometryReader { proxy in
                            Color.clear.preference(
                                key: GroupListHeightKey.self,
                                value: proxy.size.height
                            )
                        }
                    )
                }
                .onPreferenceChange(GroupListHeightKey.self) { groupListHeight = $0 }
                .frame(height: groupListHeight == 0 ? nil : min(groupListHeight, maxGroupListHeight))

                Divider()

                joinArea

                Divider()

                paletteHotkeyRow

                Divider()

                githubArea
            }
        }
        .padding(14)
        .frame(width: 320)
        // AppKit never blurs a focused control when empty space is
        // clicked — do it ourselves so the focus ring can disappear.
        .contentShape(Rectangle())
        .onTapGesture {
            NSApp.keyWindow?.makeFirstResponder(nil)
        }
        // The popover shows every circle code (the sole credential — whoever
        // reads one can join), the outgoing draft and the GitHub device
        // code, so it stays out of screen shares like the notch does.
        .excludedFromScreenCapture()
        #if DEBUG
        // Re-apply the sharing type to every on-screen surface the moment the
        // "Allow in screenshots" toggle flips, so it takes effect without a
        // relaunch (and this popover itself becomes capturable live).
        .onChange(of: allowInScreenshots) { CaptureScreenshotPreference.notifyChanged() }
        #endif
    }

    private var header: some View {
        HStack {
            BrandGlyph.image
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 16, height: 16)
                .foregroundStyle(.primary)
            Text("Munkel")
                .font(.headline)
            Spacer()
            settingsMenu
        }
    }

    private var settingsMenu: some View {
        Menu {
            Button {
                showAbout()
            } label: {
                Label("About Munkel", systemImage: "info.circle")
            }
            if let updater = model.updater {
                UpdaterMenuItems(updater: updater)
            }
            Button {
                model.openCommandPalette()
            } label: {
                Label("Quick send…", systemImage: "paperplane")
            }
            // Release only: the dev build doesn't embed the CLI (run it from
            // source with `MUNKEL_DEV=1 bun apps/cli/src/munkel.ts`).
            #if !DEBUG
            Button {
                CLIInstaller.installFromMenu()
            } label: {
                Label("Install Command Line Tool…", systemImage: "terminal")
            }
            #endif
            Divider()
            // Bound to live SMAppService status, not @AppStorage: it reads back
            // the real system state (incl. changes from System Settings › Login
            // Items) and never crashes — `try?` snaps the toggle back to its
            // true state if a register/unregister fails.
            Toggle("Launch at Login", isOn: Binding(
                get: { loginItem.isEnabled },
                set: { loginItem.setEnabled($0) }
            ))
            Divider()
            // Which display the notch appears on. "Automatic" follows the active
            // screen; a specific pick is remembered by the display's stable UUID
            // and applies to the next notch (panels are rebuilt per message).
            Picker(selection: $preferredDisplayID) {
                Text("Automatic").tag("")
                ForEach(displayList.displays) { option in
                    Text(option.name).tag(option.id)
                }
            } label: {
                Label("Preferred Display", systemImage: "display")
            }
            #if DEBUG
            Divider()
            Toggle("Echo my broadcasts to me", isOn: $devEchoBroadcasts)
            Toggle("Allow in screenshots", isOn: $allowInScreenshots)
            #endif
            Divider()
            Button {
                NSApp.terminate(nil)
            } label: {
                Label("Quit", systemImage: "power")
            }
            .keyboardShortcut("q")
        } label: {
            Image(systemName: "gearshape")
                .foregroundStyle(.secondary)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .help("Settings")
    }

    private func showAbout() {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.orderFrontStandardAboutPanel(nil)
    }

    /// One field for both flows: join and create are the same operation in
    /// the protocol (knowing the code is knowing the group), so the UI
    /// stops pretending otherwise. The die fills in a generated code for
    /// the cases where guessability matters.
    private var joinArea: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                TextField("Your circle", text: $joinCode)
                    .frostedField()
                    .onSubmit(joinTapped)
                Button {
                    joinCode = GroupCode.generate()
                } label: {
                    Image(systemName: "die.face.5")
                }
                .help("Roll a random code")
                Button("Join", action: joinTapped)
                    .disabled(joinCode.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            Text("If the circle doesn't exist yet, it's created.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var paletteHotkeyRow: some View {
        HStack {
            Image(systemName: "paperplane")
                .foregroundStyle(.secondary)
            Text("Quick send")
                .font(.callout)
            Spacer()
            KeyboardShortcuts.Recorder(for: .togglePalette)
        }
    }

    @ViewBuilder
    private var githubArea: some View {
        switch model.githubLoginState {
        case .idle:
            if let login = model.githubUserLogin {
                HStack(spacing: 8) {
                    AvatarView(name: model.displayName, imageData: Identity.avatarData, size: 20)
                    Text("Signed in as \(model.displayName) (@\(login))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Sign out") { model.logoutGitHub() }
                        .controlSize(.small)
                }
            } else {
                Button {
                    model.startGitHubLogin()
                } label: {
                    Label("Sign in with GitHub", systemImage: "person.crop.circle.badge.checkmark")
                }
                .disabled(!GitHubConfig.isConfigured)
                .help(
                    GitHubConfig.isConfigured
                        ? "Fetches your username + avatar from GitHub (once, no account)"
                        : "No client ID configured — see README"
                )
            }

        case .requestingCode:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Connecting to GitHub…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Cancel") { model.cancelGitHubLogin() }
                    .controlSize(.small)
            }

        case let .awaitingUser(userCode, verificationURI, _):
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(userCode)
                        .font(.system(.title3, design: .monospaced).weight(.bold))
                        .textSelection(.enabled)
                    Button {
                        copyUserCode(userCode)
                    } label: {
                        Image(systemName: userCodeCopied ? "checkmark" : "doc.on.doc")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .help("Copy code")
                    Spacer()
                    Button("Cancel") { model.cancelGitHubLogin() }
                        .controlSize(.small)
                }
                Text(
                    userCodeCopied
                        ? "Code copied — paste it on github.com."
                        : "Paste this code on github.com."
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                Button("Open browser again") {
                    copyUserCode(userCode)
                    NSWorkspace.shared.open(verificationURI)
                }
                .controlSize(.small)
            }

        case .fetchingProfile:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Loading GitHub profile…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

        case let .failed(message):
            HStack {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.red)
                Spacer()
                Button("Retry") { model.startGitHubLogin() }
                    .controlSize(.small)
                Button("Dismiss") { model.cancelGitHubLogin() }
                    .controlSize(.small)
            }
        }
    }

    private func copyUserCode(_ code: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(code, forType: .string)
        userCodeCopied = true
    }

    private func joinTapped() {
        model.join(code: joinCode)
        joinCode = ""
    }
}

/// The update section of the settings menu: a prominent "Update to <version>…"
/// item once Sparkle has found a newer release (its menu-bar "gentle reminder"),
/// the manual check, and a toggle for background checks. Its own
/// `@ObservedObject` view so the menu re-renders as the updater's state changes.
private struct UpdaterMenuItems: View {
    @ObservedObject var updater: UpdaterController

    var body: some View {
        if let version = updater.availableUpdateVersion {
            Button {
                updater.checkForUpdates()
            } label: {
                Label("Update to \(version)…", systemImage: "arrow.down.circle.fill")
            }
        }
        Button {
            updater.checkForUpdates()
        } label: {
            Label("Check for Updates…", systemImage: "arrow.triangle.2.circlepath")
        }
        .disabled(!updater.canCheckForUpdates)
        Toggle("Check Automatically", isOn: $updater.automaticallyChecksForUpdates)
    }
}

/// A selectable round recipient target with an accent ring when chosen and a
/// fast custom tooltip on hover (the system `.help()` delay felt laggy). On
/// hover it reports its name + frame up to the card, which floats the bubble
/// outside the recipient row's clipping ScrollView.
private struct TargetChip<Label: View>: View {
    let selected: Bool
    let tooltip: String
    let cardSpace: String
    @Binding var hoverTip: GroupSectionView.HoverTip?
    let action: () -> Void
    @ViewBuilder let label: Label

    @State private var hoverTask: Task<Void, Never>?

    var body: some View {
        Button(action: action) {
            label
                .overlay(
                    Circle()
                        .strokeBorder(Color.accentColor, lineWidth: 2)
                        .opacity(selected ? 1 : 0)
                )
                .overlay(
                    Circle()
                        .strokeBorder(Color.accentColor, lineWidth: 2)
                        .padding(-2)
                        .opacity(selected ? 0.35 : 0)
                )
        }
        .buttonStyle(.plain)
        .animation(.spring(duration: 0.25), value: selected)
        .background(
            GeometryReader { geo in
                Color.clear.onHover { hovering in
                    hoverTask?.cancel()
                    if hovering {
                        let frame = geo.frame(in: .named(cardSpace))
                        hoverTask = Task {
                            try? await Task.sleep(for: .milliseconds(120))
                            guard !Task.isCancelled else { return }
                            withAnimation(.easeOut(duration: 0.1)) {
                                hoverTip = .init(text: tooltip, midX: frame.midX, topY: frame.minY)
                            }
                        }
                    } else if hoverTip?.text == tooltip {
                        withAnimation(.easeOut(duration: 0.1)) { hoverTip = nil }
                    }
                }
            }
        )
    }
}

private struct GroupListHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// Frosted-glass text field, replacing the opaque white .roundedBorder
/// style: translucent material so the popover background shimmers
/// through, plus a hairline border for definition.
private struct FrostedField: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    @FocusState private var focused: Bool

    func body(content: Content) -> some View {
        content
            .textFieldStyle(.plain)
            .focused($focused)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            // White tint over the material lightens it while keeping the
            // translucency — gently in dark mode, where 35% white would
            // turn the fields into gray slabs.
            .background(
                RoundedRectangle(cornerRadius: 7)
                    .fill(.white.opacity(colorScheme == .dark ? 0.08 : 0.35))
            )
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 7))
            .overlay(
                RoundedRectangle(cornerRadius: 7)
                    .strokeBorder(Color(nsColor: .separatorColor), lineWidth: 1)
            )
            // .plain draws no focus ring, so the frosted style brings its
            // own: the system-typical soft accent halo around the field.
            .overlay(
                RoundedRectangle(cornerRadius: 8.5)
                    .inset(by: -1.5)
                    .stroke(Color.accentColor.opacity(focused ? 0.5 : 0), lineWidth: 3)
            )
            .animation(.easeOut(duration: 0.15), value: focused)
    }
}

extension View {
    func frostedField() -> some View {
        modifier(FrostedField())
    }
}

struct GroupSectionView: View {
    @EnvironmentObject private var model: AppModel
    let code: String

    @State private var draft = ""
    /// Selected send target; nil = everyone (the globe). Default everyone.
    @State private var recipient: String?
    /// Briefly turns the send button into a checkmark after a send.
    @State private var justSent = false
    @State private var sentNoticeToken = 0
    /// Active member tooltip (custom, fast) — replaces the slow `.help()`.
    @State private var hoverTip: HoverTip?
    /// Images staged for sending (pasted with ⌘V); Return sends them with the
    /// typed text as the shared caption.
    @State private var attachedImages: [Data] = []
    /// Local ⌘V monitor, live only while this field is focused (the popover
    /// has no Edit menu route to onPasteCommand for image data).
    @State private var pasteMonitor: Any?
    @FocusState private var fieldFocused: Bool

    private let targetSize: CGFloat = 26
    private let cardSpace = "circleCard"

    /// A target chip's tooltip text plus where to float it (card coordinates).
    struct HoverTip: Equatable {
        let text: String
        let midX: CGFloat
        let topY: CGFloat
    }

    var body: some View {
        let session = model.session(for: code)
        let members = session?.members ?? []

        VStack(alignment: .leading, spacing: 8) {
            header(connected: session?.isConnected == true)
            recipientRow(members: members)
            messageRow(members: members)
        }
        .padding(10)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
        .coordinateSpace(name: cardSpace)
        // Floating member tooltip, drawn at card level so the recipient row's
        // horizontal ScrollView can't clip it.
        .overlay(alignment: .topLeading) {
            if let tip = hoverTip {
                Text(tip.text)
                    .font(.caption2)
                    .lineLimit(1)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 5))
                    .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(.quaternary, lineWidth: 1))
                    .fixedSize()
                    .position(x: tip.midX, y: max(tip.topY - 14, 6))
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }
        }
        // A selected member going offline silently falls back to everyone,
        // so the highlight always points at a real, sendable target.
        .onChange(of: members) {
            if let r = recipient, !members.contains(where: { $0.id == r }) {
                recipient = nil
            }
        }
        // ⌘V-to-attach is wired to the field's focus: the monitor lives only
        // while this composer is the active one, so exactly one is ever armed.
        .onChange(of: fieldFocused) { _, focused in updatePasteMonitor(focused) }
        .onDisappear { teardownPasteMonitor() }
    }

    /// Installs (on focus) / removes (on blur) a local ⌘V monitor that stages
    /// a clipboard image. Plain text paste falls through to the field editor.
    private func updatePasteMonitor(_ focused: Bool) {
        if focused, pasteMonitor == nil {
            let binding = $attachedImages
            pasteMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
                // Side effect inside the isolation; the NSEvent (non-Sendable)
                // is returned outside it — MainActor.assumeIsolated requires a
                // Sendable result.
                var consume = false
                MainActor.assumeIsolated {
                    guard event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command,
                          event.charactersIgnoringModifiers?.lowercased() == "v",
                          binding.wrappedValue.count < AppPayload.maxImagesPerMessage,
                          let data = ClipboardImage.read()
                    else {
                        return
                    }
                    binding.wrappedValue.append(data)
                    consume = true
                }
                return consume ? nil : event
            }
        } else if !focused {
            teardownPasteMonitor()
        }
    }

    private func teardownPasteMonitor() {
        if let pasteMonitor {
            NSEvent.removeMonitor(pasteMonitor)
        }
        pasteMonitor = nil
    }

    private func header(connected: Bool) -> some View {
        HStack {
            Circle()
                .fill(connected ? Color.green : Color.orange)
                .frame(width: 8, height: 8)
                .help(connected ? "Connected" : "Connecting…")
            Text(code)
                .font(.system(.subheadline, design: .monospaced).weight(.semibold))
            Button {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(code, forType: .string)
            } label: {
                Image(systemName: "doc.on.doc")
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .help("Copy code")
            Spacer()
            Button {
                model.leave(code: code)
            } label: {
                Image(systemName: "rectangle.portrait.and.arrow.right")
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .help("Leave circle")
        }
    }

    private func recipientRow(members: [GroupSession.Member]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                TargetChip(
                    selected: recipient == nil,
                    tooltip: "Everyone",
                    cardSpace: cardSpace,
                    hoverTip: $hoverTip
                ) {
                    recipient = nil
                } label: {
                    Image(systemName: "globe")
                        .font(.system(size: 13))
                        .frame(width: targetSize, height: targetSize)
                        .background(.quaternary, in: Circle())
                }

                ForEach(members) { member in
                    TargetChip(
                        selected: recipient == member.id,
                        tooltip: member.label,
                        cardSpace: cardSpace,
                        hoverTip: $hoverTip
                    ) {
                        recipient = member.id
                        fieldFocused = true
                    } label: {
                        AvatarView(name: member.label, imageData: member.avatar, size: targetSize)
                    }
                }

                if members.isEmpty {
                    Text("No one else online")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.leading, 4)
                }
            }
            .padding(2)
        }
    }

    private func messageRow(members: [GroupSession.Member]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if !attachedImages.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(Array(attachedImages.enumerated()), id: \.offset) { index, data in
                            if let image = NSImage(data: data) {
                                Button { attachedImages.remove(at: index) } label: {
                                    Image(nsImage: image)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 34, height: 34)
                                        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                                        .overlay(alignment: .topTrailing) {
                                            Image(systemName: "xmark.circle.fill")
                                                .font(.system(size: 11))
                                                .foregroundStyle(.white, .black.opacity(0.5))
                                                .padding(1)
                                        }
                                }
                                .buttonStyle(.plain)
                                .help("Remove")
                            }
                        }
                    }
                    .padding(.vertical, 1)
                }
            }

            HStack(spacing: 6) {
                TextField(placeholder(members: members), text: $draft)
                    .frostedField()
                    .focused($fieldFocused)
                    .onSubmit(sendTapped)
                    .onChange(of: draft) { _, new in
                        if new.count > MessageLimits.maxCharacters {
                            draft = String(new.prefix(MessageLimits.maxCharacters))
                        }
                    }

                Button(action: sendTapped) {
                    // Confirmation lives in the button itself — a brief checkmark
                    // instead of a chip that overlapped the field's placeholder.
                    // Neutral color, and a fixed-size frame so swapping the glyph
                    // never changes the button's width.
                    Image(systemName: justSent ? "checkmark" : "paperplane.fill")
                        .foregroundStyle(.primary)
                        .frame(width: 16, height: 16)
                        .animation(.spring(duration: 0.25), value: justSent)
                }
                .disabled(!canSend && !justSent)
                .help(sendHelp(members: members))
            }
        }
    }

    private var canSend: Bool {
        !attachedImages.isEmpty || !draft.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func placeholder(members: [GroupSession.Member]) -> String {
        // Same prompt whether or not images are attached — typed text becomes
        // the caption when there are.
        if let id = recipient, let m = members.first(where: { $0.id == id }) {
            return "Message \(m.label)…"
        }
        return "Message everyone…"
    }

    private func sendHelp(members: [GroupSession.Member]) -> String {
        if let id = recipient, let m = members.first(where: { $0.id == id }) {
            return "Send to \(m.label) (↩)"
        }
        return "Send to everyone (↩)"
    }

    private func sendTapped() {
        if !attachedImages.isEmpty {
            // Typed text rides along as the album's shared caption.
            model.send(images: attachedImages, caption: draft.trimmingCharacters(in: .whitespaces), group: code, to: recipient)
            draft = ""
            attachedImages = []
            flashSent()
            return
        }
        let text = draft.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        model.send(text: text, group: code, to: recipient)
        draft = ""
        flashSent()
    }

    private func flashSent() {
        sentNoticeToken += 1
        let token = sentNoticeToken
        withAnimation(.spring(duration: 0.25)) { justSent = true }
        Task {
            try? await Task.sleep(for: .seconds(1.4))
            guard token == sentNoticeToken else { return }
            withAnimation(.spring(duration: 0.25)) { justSent = false }
        }
    }
}
