import SwiftUI

struct MenuView: View {
    @EnvironmentObject private var model: AppModel
    @State private var joinCode = ""
    @State private var userCodeCopied = false
    @State private var groupListHeight: CGFloat = 0

    /// Cap before the group list starts scrolling.
    private let maxGroupListHeight: CGFloat = 360

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header

            // GitHub login is mandatory: until it happens, the menu offers
            // nothing but the login flow.
            if model.githubUserLogin == nil {
                Text("Melde dich mit GitHub an, um Munkel zu benutzen.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    // Without this the popup truncates to one ellipsized
                    // line instead of wrapping.
                    .fixedSize(horizontal: false, vertical: true)

                githubArea
            } else {
                if model.groupCodes.isEmpty {
                    Text("Noch kein Kreis. Erstelle einen oder tritt mit einem Code bei.")
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
                Label("Über Munkel", systemImage: "info.circle")
            }
            Button {
                checkForUpdates()
            } label: {
                Label("Nach Updates suchen…", systemImage: "arrow.triangle.2.circlepath")
            }
            Divider()
            Button {
                NSApp.terminate(nil)
            } label: {
                Label("Beenden", systemImage: "power")
            }
            .keyboardShortcut("q")
        } label: {
            Image(systemName: "gearshape")
                .foregroundStyle(.secondary)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .help("Einstellungen")
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
        alert.messageText = "Nach Updates suchen"
        alert.informativeText = "Du verwendest Munkel \(version). Die automatische Update-Prüfung ist noch nicht verfügbar."
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
                TextField("Dein Kreis", text: $joinCode)
                    .frostedField()
                    .onSubmit(joinTapped)
                Button {
                    joinCode = GroupCode.generate()
                } label: {
                    Image(systemName: "die.face.5")
                }
                .help("Zufälligen Code würfeln")
                Button("Beitreten", action: joinTapped)
                    .disabled(joinCode.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            Text("Gibt es den Kreis noch nicht, wird er erstellt.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var githubArea: some View {
        switch model.githubLoginState {
        case .idle:
            if let login = model.githubUserLogin {
                HStack(spacing: 8) {
                    AvatarView(name: model.displayName, imageData: Identity.avatarData, size: 20)
                    Text("Angemeldet als \(model.displayName) (@\(login))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Abmelden") { model.logoutGitHub() }
                        .controlSize(.small)
                }
            } else {
                Button {
                    model.startGitHubLogin()
                } label: {
                    Label("Mit GitHub anmelden", systemImage: "person.crop.circle.badge.checkmark")
                }
                .disabled(!GitHubConfig.isConfigured)
                .help(
                    GitHubConfig.isConfigured
                        ? "Holt Username + Avatar von GitHub (einmalig, kein Konto)"
                        : "Keine Client-ID konfiguriert — siehe README"
                )
            }

        case .requestingCode:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Verbinde mit GitHub…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Abbrechen") { model.cancelGitHubLogin() }
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
                    .help("Code kopieren")
                    Spacer()
                    Button("Abbrechen") { model.cancelGitHubLogin() }
                        .controlSize(.small)
                }
                Text(
                    userCodeCopied
                        ? "Code kopiert — auf github.com einfügen."
                        : "Diesen Code auf github.com einfügen."
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                Button("Browser erneut öffnen") {
                    copyUserCode(userCode)
                    NSWorkspace.shared.open(verificationURI)
                }
                .controlSize(.small)
            }

        case .fetchingProfile:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Lade GitHub-Profil…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

        case let .failed(message):
            HStack {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.red)
                Spacer()
                Button("Erneut") { model.startGitHubLogin() }
                    .controlSize(.small)
                Button("Verwerfen") { model.cancelGitHubLogin() }
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
    @State private var recipient: String?

    var body: some View {
        // Re-renders on presenceVersion bumps via the EnvironmentObject.
        let session = model.session(for: code)
        let members = session?.members ?? []

        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Circle()
                    .fill(session?.isConnected == true ? Color.green : Color.orange)
                    .frame(width: 8, height: 8)
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
                .help("Code kopieren")
                Spacer()
                Button {
                    model.leave(code: code)
                } label: {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Kreis verlassen")
            }

            if members.isEmpty {
                Text("Niemand sonst online")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                HStack(spacing: 6) {
                    HStack(spacing: -5) {
                        ForEach(members.prefix(8)) { member in
                            AvatarView(name: member.label, imageData: member.avatar, size: 16)
                        }
                    }
                    Text(members.map(\.label).joined(separator: ", "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            HStack(spacing: 6) {
                Picker("", selection: $recipient) {
                    Text("Alle").tag(String?.none)
                    ForEach(members) { member in
                        Text(member.label).tag(String?.some(member.id))
                    }
                }
                .labelsHidden()
                .frame(width: 90)

                TextField("Nachricht…", text: $draft)
                    .frostedField()
                    .onSubmit(sendTapped)

                Button(action: sendTapped) {
                    Image(systemName: "paperplane.fill")
                }
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(10)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
    }

    private func sendTapped() {
        let text = draft.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        model.send(text: text, group: code, to: recipient)
        draft = ""
    }
}
