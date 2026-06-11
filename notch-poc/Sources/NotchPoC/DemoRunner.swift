import AppKit
import DynamicNotchKit
import SwiftUI

/// Drives the PoC: shows a first demo message on launch, then lets you
/// trigger more from the terminal to iterate on the look and feel.
@MainActor
final class DemoRunner {
    private var currentNotch: DynamicNotch<MessageNotchView, EmptyView, EmptyView>?
    private var hideTask: Task<Void, Never>?
    private var sampleIndex = 0

    private let displayDuration: Duration = .seconds(5)

    private let samples: [IncomingMessage] = [
        IncomingMessage(sender: "Anna", text: "Kaffee? Ich geh gleich zum Tresen ☕️"),
        IncomingMessage(sender: "Ben", text: "Schaut mal auf den Beamer, ich teile kurz meinen Screen"),
        IncomingMessage(sender: "Clara Maria", text: "Hat jemand einen USB-C-Adapter dabei? Meiner liegt zuhause und ich brauche dringend HDMI für die Präsentation"),
        IncomingMessage(sender: "Anna", text: "👍"),
    ]

    func start() {
        printInstructions()
        startStdinLoop()
        Task { await self.showNextSample() }
    }

    // MARK: - Terminal input

    private func printInstructions() {
        print("""

        fluesterung notch poc
        ─────────────────────
          ⏎               nächste Demo-Nachricht
          Name: Text      eigene Nachricht anzeigen
          q ⏎             beenden

        """)
    }

    private func startStdinLoop() {
        Thread.detachNewThread {
            while let line = readLine(strippingNewline: true) {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                Task { @MainActor in
                    await self.handle(input: trimmed)
                }
                if trimmed == "q" { break }
            }
            // EOF: keep the app alive so non-interactive runs still display.
        }
    }

    private func handle(input: String) async {
        switch input {
        case "q":
            NSApp.terminate(nil)
        case "":
            await showNextSample()
        default:
            if let colon = input.firstIndex(of: ":") {
                let sender = String(input[..<colon]).trimmingCharacters(in: .whitespaces)
                let text = String(input[input.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
                await show(IncomingMessage(sender: sender.isEmpty ? "?" : sender, text: text))
            } else {
                await show(IncomingMessage(sender: "Anna", text: input))
            }
        }
    }

    // MARK: - Notch presentation

    private func showNextSample() async {
        let message = samples[sampleIndex % samples.count]
        sampleIndex += 1
        await show(message)
    }

    private func show(_ message: IncomingMessage) async {
        hideTask?.cancel()
        if let previous = currentNotch {
            await previous.hide()
        }

        let notch = DynamicNotch(hoverBehavior: .all) {
            MessageNotchView(message: message)
        }
        currentNotch = notch

        await notch.expand()

        // hide() waits on its own while the pointer hovers the notch,
        // so a fixed delay is all the auto-dismiss logic we need.
        hideTask = Task { [weak notch] in
            try? await Task.sleep(for: displayDuration)
            guard !Task.isCancelled, let notch else { return }
            await notch.hide()
        }
    }
}
