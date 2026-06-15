import KeyboardShortcuts
import SwiftUI

struct MenuView: View {
    @EnvironmentObject private var model: AppModel
    @State private var joinCode = ""
    @State private var userCodeCopied = false
    @State private var groupListHeight: CGFloat = 0
    #if DEBUG
    @AppStorage("devEchoBroadcasts") private var devEchoBroadcasts = true
    #endif

    /// Cap before the group list starts scrolling.
    private let maxGroupListHeight: CGFloat = 360

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header

            // GitHub login is mandatory: until it happens, the menu offers
            // nothing but the login flow.
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
    }

    private var header: some View {
        HStack {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .foregroundStyle(.tint)
            Text("Munkel")
                .font(.headline)
            Spacer()
            settingsMenu
        }
    }

    /// Apple convention for menu-bar apps: a gear "action menu" on the
    /// right edge — About, update check, then quit with the standard ⌘Q.
    private var settingsMenu: some View {
        Menu {
            Button {
                showAbout()
            } label: {
                Label("About Munkel", systemImage: "info.circle")
            }
            Button {
                checkForUpdates()
            } label: {
                Label("Check for Updates…", systemImage: "arrow.triangle.2.circlepath")
            }
            Button {
                model.openCommandPalette()
            } label: {
                Label("Quick send…", systemImage: "paperplane")
            }
            Button {
                CLIInstaller.installFromMenu()
            } label: {
                Label("Install Command Line Tool…", systemImage: "terminal")
            }
            #if DEBUG
            Divider()
            Toggle("Echo my broadcasts to me", isOn: $devEchoBroadcasts)
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

    /// The standard about panel; it reads name and versions from the
    /// bundle's Info.plist, so future info lands there (or in a Credits
    /// file) rather than in code.
    private func showAbout() {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.orderFrontStandardAboutPanel(nil)
    }

    /// Placeholder until a real update channel exists (e.g. Sparkle or a
    /// GitHub-Releases check) — shows the running version so the item is
    /// already useful.
    private func checkForUpdates() {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Check for Updates"
        alert.informativeText = "You're running Munkel \(version). Automatic update checks aren't available yet."
        alert.addButton(withTitle: "OK")
        alert.runModal()
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

    /// Global hotkey that opens the quick-send palette from anywhere.
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
    /// Transient "Sent to …" confirmation, cleared after a short delay.
    @State private var sentNotice: String?
    @State private var sentNoticeToken = 0
    @FocusState private var fieldFocused: Bool

    private let targetSize: CGFloat = 26

    var body: some View {
        // Re-renders on presenceVersion bumps via the EnvironmentObject.
        let session = model.session(for: code)
        let members = session?.members ?? []

        VStack(alignment: .leading, spacing: 8) {
            header(connected: session?.isConnected == true)
            recipientRow(members: members)
            messageRow(members: members)
        }
        .padding(10)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
        // A selected member going offline silently falls back to everyone,
        // so the highlight always points at a real, sendable target.
        .onChange(of: members) {
            if let r = recipient, !members.contains(where: { $0.id == r }) {
                recipient = nil
            }
        }
    }

    // MARK: - Header

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

    // MARK: - Recipient picker (globe = everyone, then one avatar per member)

    private func recipientRow(members: [GroupSession.Member]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                targetButton(
                    selected: recipient == nil,
                    help: "Everyone"
                ) {
                    recipient = nil
                } label: {
                    Image(systemName: "globe")
                        .font(.system(size: 13))
                        .frame(width: targetSize, height: targetSize)
                        .background(.quaternary, in: Circle())
                }

                ForEach(members) { member in
                    targetButton(
                        selected: recipient == member.id,
                        help: member.label
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

    /// A selectable round target with an accent ring when chosen.
    private func targetButton(
        selected: Bool,
        help: String,
        action: @escaping () -> Void,
        @ViewBuilder label: () -> some View
    ) -> some View {
        Button(action: action) {
            label()
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
        .help(help)
        .animation(.spring(duration: 0.25), value: selected)
    }

    // MARK: - Message field + send

    private func messageRow(members: [GroupSession.Member]) -> some View {
        HStack(spacing: 6) {
            TextField(placeholder(members: members), text: $draft)
                .frostedField()
                .focused($fieldFocused)
                .onSubmit(sendTapped)

            Button(action: sendTapped) {
                Image(systemName: "paperplane.fill")
            }
            .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
            .help(sendHelp(members: members))
        }
        .overlay(alignment: .leading) {
            if let sentNotice {
                Label(sentNotice, systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .background(.quaternary.opacity(0.9), in: Capsule())
                    .transition(.opacity)
            }
        }
    }

    private func placeholder(members: [GroupSession.Member]) -> String {
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
        let text = draft.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        let members = model.session(for: code)?.members ?? []
        let targetName = recipient.flatMap { id in members.first { $0.id == id }?.label }
        model.send(text: text, group: code, to: recipient)
        draft = ""
        flashSent(to: targetName)
    }

    private func flashSent(to name: String?) {
        sentNoticeToken += 1
        let token = sentNoticeToken
        withAnimation(.spring(duration: 0.25)) {
            sentNotice = name.map { "Sent to \($0)" } ?? "Sent to everyone"
        }
        Task {
            try? await Task.sleep(for: .seconds(1.6))
            guard token == sentNoticeToken else { return }
            withAnimation(.spring(duration: 0.25)) { sentNotice = nil }
        }
    }
}
