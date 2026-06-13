import SwiftUI

/// The command palette: phase 1 picks a recipient across all circles, phase
/// 2 composes the message. Return advances/sends, Esc steps back or closes.
struct CommandPaletteView: View {
    @ObservedObject var model: AppModel
    @ObservedObject var state: CommandPaletteState
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            if let target = state.target {
                ComposeView(target: target, state: state, send: send)
            } else {
                PickerView(model: model, state: state, onClose: onClose, commit: commit)
            }
        }
        .frame(width: 640, height: 440)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(.white.opacity(0.08), lineWidth: 1)
        )
        // Capture-proof root (backup to the panel's sharingType): the palette
        // shows circle codes, names and the draft. Stays at the root, never
        // inside the if/else branch, or a frame could flush before exclusion.
        .excludedFromScreenCapture()
    }

    private func commit() {
        guard let recipient = state.selectedRecipient else { return }
        state.target = recipient
        state.query = ""
        state.selectedIndex = 0
    }

    private func send() {
        let text = state.message.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty, let target = state.target else { return }
        model.send(text: text, group: target.circle, to: target.memberId)
        onClose()
    }
}

// MARK: - Phase 1: pick a recipient

private struct PickerView: View {
    @ObservedObject var model: AppModel
    @ObservedObject var state: CommandPaletteState
    let onClose: () -> Void
    let commit: () -> Void
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "paperplane")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                TextField("Send to… (name or circle)", text: $state.query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 22, weight: .regular))
                    .focused($focused)
                    .onSubmit(commit)
                    .onExitCommand(perform: onClose)
                    .onChange(of: state.query) { state.selectedIndex = 0 }
            }
            .padding(.horizontal, 20)
            .frame(height: 60)

            Divider()

            recipientList
        }
        .onAppear {
            // The panel is mid makeKey on first show; a synchronous focus
            // write is lost. Defer one tick — same trick as the notch reply.
            Task {
                try? await Task.sleep(for: .milliseconds(80))
                focused = true
            }
        }
        // Keep the selection in range when the list shrinks under it — a peer
        // leaving or a logout mutates filteredRecipients with no query change,
        // which would otherwise strand the highlight past the end.
        .onChange(of: state.filteredRecipients.count) { _, count in
            state.selectedIndex = min(state.selectedIndex, max(0, count - 1))
        }
    }

    private var emptyMessage: String {
        if model.githubUserLogin == nil {
            return "Sign in with GitHub to use Munkel."
        }
        return state.query.isEmpty ? "Join a circle to send." : "No matches."
    }

    @ViewBuilder
    private var recipientList: some View {
        let recipients = state.filteredRecipients
        if recipients.isEmpty {
            VStack {
                Spacer()
                Text(emptyMessage)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .frame(maxWidth: .infinity)
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(Array(recipients.enumerated()), id: \.element.id) { index, recipient in
                            RecipientRow(recipient: recipient, selected: index == state.selectedIndex)
                                .id(index)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    state.selectedIndex = index
                                    commit()
                                }
                        }
                    }
                    .padding(8)
                }
                .onChange(of: state.selectedIndex) {
                    proxy.scrollTo(state.selectedIndex, anchor: .center)
                }
            }
        }
    }
}

private struct RecipientRow: View {
    let recipient: Recipient
    let selected: Bool

    var body: some View {
        HStack(spacing: 10) {
            if recipient.isEveryone {
                Image(systemName: "person.2.fill")
                    .frame(width: 24, height: 24)
                    .foregroundStyle(.secondary)
            } else {
                AvatarView(name: recipient.label, imageData: recipient.avatar, size: 24)
            }
            Text(recipient.label)
                .font(.body)
            Spacer()
            Text(recipient.circle)
                .font(.system(.callout, design: .monospaced))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(selected ? Color.accentColor.opacity(0.25) : Color.clear)
        )
    }
}

// MARK: - Phase 2: compose the message

private struct ComposeView: View {
    let target: Recipient
    @ObservedObject var state: CommandPaletteState
    let send: () -> Void
    @FocusState private var focused: Bool

    private var isEmpty: Bool {
        state.message.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button {
                    state.target = nil // back to the picker
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.title3)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)

                if target.isEveryone {
                    Image(systemName: "person.2.fill").foregroundStyle(.secondary)
                } else {
                    AvatarView(name: target.label, imageData: target.avatar, size: 22)
                }
                Text(target.label).font(.headline)
                Text(target.circle)
                    .font(.system(.callout, design: .monospaced))
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(.horizontal, 16)
            .frame(height: 52)

            Divider()

            HStack(spacing: 10) {
                TextField("Message \(target.label)…", text: $state.message)
                    .textFieldStyle(.plain)
                    .font(.system(size: 20))
                    .focused($focused)
                    .onSubmit(send)
                    .onExitCommand { state.target = nil } // Esc → back to picker

                Button(action: send) {
                    Image(systemName: "paperplane.fill")
                        .font(.title3)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.tint)
                .disabled(isEmpty)
            }
            .padding(.horizontal, 20)
            .frame(height: 60)

            Spacer()
        }
        .onAppear {
            Task {
                try? await Task.sleep(for: .milliseconds(80))
                focused = true
            }
        }
    }
}
