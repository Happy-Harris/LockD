import Foundation

extension Notification.Name {
    /// Posted in the app process when a tap was added to a store below. `userInfo["store"]` names it. A plugin turns
    /// it into a `pending` event for the web layer; the web layer then pulls the queue. A hint only: the queue is the truth.
    static let lockdPendingActions = Notification.Name("lockd.pendingActions")
}

/// A small persisted queue of taps that arrived while the web layer may not be running (a watch button, a Live
/// Activity button). Native code only keeps them and when they were made; the web store applies each one, then
/// acknowledges it here (src/lib/native/pending-intents.ts). The phone stays the only writer of the log.
///
/// The queue is a file written atomically, so a tap survives the app being killed. It is shared by the app and the
/// widget extension (a Live Activity button runs in the app's process, but its code is compiled into both).
final class PendingActionStore {
    static let restTimer = PendingActionStore(name: "restTimer")
    static let watch = PendingActionStore(name: "watch")

    /// More than this and the oldest are dropped. Far beyond anything a lifter taps between two looks at the phone.
    private static let capacity = 200

    let name: String
    private let url: URL
    private let lock = NSLock()

    init(name: String) {
        self.name = name
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        self.url = base.appendingPathComponent("lockd-pending-\(name).json")
    }

    /// Adds one tap. `id` dedupes: a tap delivered twice (a live message and a queued one) is kept once. Returns
    /// false when it was already there.
    @discardableResult
    func enqueue(id: String?, receivedAtMs: Double, payload: [String: Any]) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        var all = read()
        let itemId = (id?.isEmpty == false ? id! : UUID().uuidString)
        if all.contains(where: { ($0["id"] as? String) == itemId }) { return false }
        all.append(["id": itemId, "receivedAtMs": receivedAtMs, "payload": payload])
        if all.count > PendingActionStore.capacity { all.removeFirst(all.count - PendingActionStore.capacity) }
        write(all)
        return true
    }

    func items() -> [[String: Any]] {
        lock.lock()
        defer { lock.unlock() }
        return read()
    }

    func remove(ids: [String]) {
        lock.lock()
        defer { lock.unlock() }
        let drop = Set(ids)
        write(read().filter { !drop.contains(($0["id"] as? String) ?? "") })
    }

    /// Tells the plugin that owns this store that something is waiting.
    func announce() {
        NotificationCenter.default.post(name: .lockdPendingActions, object: nil, userInfo: ["store": name])
    }

    private func read() -> [[String: Any]] {
        guard let data = try? Data(contentsOf: url),
              let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }
        return parsed
    }

    private func write(_ items: [[String: Any]]) {
        guard let data = try? JSONSerialization.data(withJSONObject: items) else { return }
        try? data.write(to: url, options: [.atomic])
    }
}
