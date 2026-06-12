import SwiftUI

/// Menu content displayed in the notch-hover panel. Has a black background
/// and shows all the same options as the menu bar menu.
struct NotchMenuView: View {
    @ObservedObject var model: AppModel
    @State private var joinCode = ""
    @State private var lastCreatedCode: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header

            if model.groupCodes.isEmpty {
                Text("Noch keine Gruppe. Erstelle eine oder tritt mit einem Code bei.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(model.groupCodes, id: \.self) { code in
                            GroupSectionView(code: code)
                                .environmentObject(model)
                        }
                    }
                }
                .frame(maxHeight: 200)
            }

            Divider()
                .background(.white.opacity(0.2))

            joinArea

            Divider()
                .background(.white.opacity(0.2))

            footer
        }
        .padding(14)
        .background(Color.black)
        .foregroundStyle(.white)
        .frame(width: 380)
        .environment(\.colorScheme, .dark)
    }

    private var header: some View {
        HStack {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .foregroundStyle(.cyan)
            Text("Flüsterung")
                .font(.headline)
            Spacer()
            TextField("Dein Name", text: $model.displayName)
                .textFieldStyle(.roundedBorder)
                .frame(width: 100)
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
        HStack(spacing: 8) {
            TextField("Relay-URL", text: $model.relayURLString)
                .textFieldStyle(.roundedBorder)
                .font(.caption)
            Button("Beenden") {
                NSApp.terminate(nil)
            }
            .font(.caption)
        }
    }

    private func joinTapped() {
        model.join(code: joinCode)
        joinCode = ""
    }
}
