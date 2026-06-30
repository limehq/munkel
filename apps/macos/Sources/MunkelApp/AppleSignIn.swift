import AppKit
import AuthenticationServices

enum AppleAuthError: Error {
    case noPresentationAnchor
    case malformedCredential
    case failed(String)
}

/// Sign in with Apple. Unlike GitHub's headless device flow (which lives in
/// MunkelKit), Apple's flow is UI-bound — `ASAuthorizationController` presents a
/// system sheet — so it lives here in the app target.
///
/// Apple returns the full name only on the *first* authorization for an app, so
/// we remember it keyed by the user id and reuse it on later sign-ins. No token
/// is kept, matching the GitHub provider: the result is just an `AuthProfile`.
@MainActor
final class AppleSignIn: NSObject {
    private var continuation: CheckedContinuation<AuthProfile, Error>?
    private var controller: ASAuthorizationController?

    func signIn() async throws -> AuthProfile {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        self.controller = controller

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    private func finish(_ result: Result<AuthProfile, Error>) {
        continuation?.resume(with: result)
        continuation = nil
        controller = nil
    }

    private static func nameKey(_ userID: String) -> String { "appleName.\(userID)" }

    /// Apple gives the name only on first authorization, so persist it and fall
    /// back to the stored value (then a sensible default) on later sign-ins.
    private static func displayName(for credential: ASAuthorizationAppleIDCredential) -> String {
        let key = nameKey(credential.user)
        if let given = credential.fullName?.givenName?.trimmingCharacters(in: .whitespaces),
           !given.isEmpty {
            UserDefaults.standard.set(given, forKey: key)
            return given
        }
        if let stored = UserDefaults.standard.string(forKey: key), !stored.isEmpty {
            return stored
        }
        return NSFullUserName()
    }
}

extension AppleSignIn: ASAuthorizationControllerDelegate {
    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            finish(.failure(AppleAuthError.malformedCredential))
            return
        }
        let profile = AuthProfile(
            provider: .apple,
            providerUserID: credential.user,
            displayName: Self.displayName(for: credential),
            avatarURL: nil,
            avatarData: nil
        )
        finish(.success(profile))
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        // A user-cancelled sheet is silent, like cancelling the GitHub flow.
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            finish(.failure(CancellationError()))
        } else {
            finish(.failure(AppleAuthError.failed(error.localizedDescription)))
        }
    }
}

extension AppleSignIn: ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        NSApp.keyWindow ?? NSApp.mainWindow ?? NSApp.windows.first ?? ASPresentationAnchor()
    }
}
