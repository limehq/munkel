import AppKit
import Combine
import Foundation
import ServiceManagement

enum LoginItem {
    private static let didAutoRegisterKey = "loginItemAutoRegistered"

    static var isEnabled: Bool {
        SMAppService.mainApp.status == .enabled
    }

    static func setEnabled(_ enabled: Bool) throws {
        if enabled {
            guard SMAppService.mainApp.status != .enabled else { return }
            try SMAppService.mainApp.register()
        } else {
            try SMAppService.mainApp.unregister()
        }
    }

    static func registerOnFirstLaunchIfNeeded() {
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: didAutoRegisterKey) else { return }
        defaults.set(true, forKey: didAutoRegisterKey)
        do {
            try setEnabled(true)
        } catch {
            NSLog("munkel: login-item auto-register failed: \(error)")
        }
    }
}

@MainActor
final class LoginItemModel: ObservableObject {
    @Published var isEnabled: Bool
    private var observation: AnyCancellable?

    init() {
        isEnabled = LoginItem.isEnabled
        observation = NotificationCenter.default
            .publisher(for: NSApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in self?.reconcile() }
    }

    func setEnabled(_ enabled: Bool) {
        do {
            try LoginItem.setEnabled(enabled)
            isEnabled = enabled
        } catch {
            isEnabled = LoginItem.isEnabled
        }
    }

    private func reconcile() {
        let real = LoginItem.isEnabled
        if real != isEnabled { isEnabled = real }
    }
}
