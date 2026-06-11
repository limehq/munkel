import SwiftUI

struct MenuView: View {
    @EnvironmentObject private var model: AppModel
    @State private var joinCode = ""
    @State private var lastCreatedCode: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header

            if model.groupCodes.isEmpty {
                Text("Noch keine Gruppe. Erstelle eine oder tritt mit einem Code bei.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            ForEach(model.groupCodes, id: \.self) { code in
                GroupSectionView(code: code)
            }

            Divider()

            joinArea

            Divider()

            footer
        }
        .padding(14)
        .frame(width: 320)
    }

    private var header: some View {
        HStack {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .foregroundStyle(.tint)
            Text("Flüsterung")
                .font(.headline)
            Spacer()
            TextField("Dein Name", text: $model.displayName)
                .textFieldStyle(.roundedBorder)
                .frame(width: 120)
        }
    }

    private var joinArea: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                TextField("Gruppencode", text: $joinCode)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit(joinTapped)
                Button("Beitreten", action: joinTapped)
                    .disabled(joinCode.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            HStack {
                Button("Neue Gruppe erstellen") {
                    lastCreatedCode = model.createGroup()
                }
                if let created = lastCreatedCode {
                    Text("\(created) kopiert ✓")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var footer: some View {
        HStack {
            TextField("Relay-URL", text: $model.relayURLString)
                .textFieldStyle(.roundedBorder)
                .font(.caption)
            Button("Beenden") {
                NSApp.terminate(nil)
            }
        }
    }

    private func joinTapped() {
        model.join(code: joinCode)
        joinCode = ""
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
                Spacer()
                Button {
                    model.leave(code: code)
                } label: {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Gruppe verlassen")
            }

            if members.isEmpty {
                Text("Niemand sonst online")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text(members.map(\.label).joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
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
                    .textFieldStyle(.roundedBorder)
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
