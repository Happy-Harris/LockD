import Capacitor
import Foundation
import HealthKit

/// The iOS half of health context (Opp 10, docs/design/health-context.md): read-only bodyweight, sleep and heart rate
/// variability from Apple Health. Nothing is written back. Apple Health reports HRV as SDNN, so every HRV sample is
/// labelled `sdnn` and is never compared with Health Connect's RMSSD.
@objc(LockdHealthPlugin)
public class LockdHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LockdHealthPlugin"
    public let jsName = "LockdHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

    /// Raw values of the sleep stages that count as asleep: unspecified (1), core (3), deep (4) and REM (5).
    /// In bed (0) and awake (2) do not. Raw values keep this compiling below iOS 16, where the named cases do not exist.
    private static let asleepValues: Set<Int> = [1, 3, 4, 5]

    private static func objectType(_ name: String) -> HKObjectType? {
        switch name {
        case "bodyweight": return HKObjectType.quantityType(forIdentifier: .bodyMass)
        case "hrv": return HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)
        case "sleep": return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        default: return nil
        }
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        let types = call.getArray("types", String.self) ?? []
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": [String]()])
            return
        }
        let readTypes = Set(types.compactMap { Self.objectType($0) })
        store.requestAuthorization(toShare: nil, read: readTypes) { _, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            // Apple Health never says whether read access was given, to protect the lifter's privacy. A type that
            // was refused simply reads back empty.
            call.resolve(["granted": types])
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        let types = call.getArray("types", String.self) ?? []
        let since = call.getObject("since") ?? [:]
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["bodyweight": [[String: Any]](), "sleep": [[String: Any]](), "hrv": [[String: Any]]()])
            return
        }
        Task {
            do {
                var bodyweight = [[String: Any]]()
                var sleep = [[String: Any]]()
                var hrv = [[String: Any]]()
                if types.contains("bodyweight") {
                    bodyweight = try await self.readBodyweight(since: Self.date(since["bodyweight"]))
                }
                if types.contains("sleep") {
                    sleep = try await self.readSleep(since: Self.date(since["sleep"]))
                }
                if types.contains("hrv") {
                    hrv = try await self.readHrv(since: Self.date(since["hrv"]))
                }
                call.resolve(["bodyweight": bodyweight, "sleep": sleep, "hrv": hrv])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private func readBodyweight(since: Date) async throws -> [[String: Any]] {
        guard let type = HKObjectType.quantityType(forIdentifier: .bodyMass) else { return [] }
        return try await samples(of: type, since: since).compactMap { sample in
            guard let quantity = sample as? HKQuantitySample else { return nil }
            return [
                "sourceId": quantity.uuid.uuidString,
                "grams": quantity.quantity.doubleValue(for: .gram()).rounded(),
                "at": Self.iso(quantity.endDate),
            ]
        }
    }

    private func readHrv(since: Date) async throws -> [[String: Any]] {
        guard let type = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) else { return [] }
        return try await samples(of: type, since: since).compactMap { sample in
            guard let quantity = sample as? HKQuantitySample else { return nil }
            return [
                "sourceId": quantity.uuid.uuidString,
                "method": "sdnn",
                "milliseconds": quantity.quantity.doubleValue(for: .secondUnit(with: .milli)),
                "at": Self.iso(quantity.endDate),
            ]
        }
    }

    private func readSleep(since: Date) async throws -> [[String: Any]] {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return [] }
        let asleep = try await samples(of: type, since: since).compactMap { sample -> SleepInterval? in
            guard let category = sample as? HKCategorySample, Self.asleepValues.contains(category.value) else { return nil }
            return SleepInterval(start: category.startDate, end: category.endDate)
        }
        return SleepIntervals.merged(asleep).map { interval in
            [
                "startAt": Self.iso(interval.start),
                "endAt": Self.iso(interval.end),
                "asleepSeconds": interval.end.timeIntervalSince(interval.start).rounded(),
            ]
        }
    }

    private func samples(of type: HKSampleType, since: Date) async throws -> [HKSample] {
        let predicate = HKQuery.predicateForSamples(withStart: since, end: nil, options: .strictStartDate)
        let order = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [order]
            ) { _, results, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: results ?? [])
                }
            }
            self.store.execute(query)
        }
    }

    private static func iso(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private static func date(_ value: Any?) -> Date {
        guard let text = value as? String else { return Date(timeIntervalSinceNow: -365 * 86_400) }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let parsed = withFraction.date(from: text) { return parsed }
        return ISO8601DateFormatter().date(from: text) ?? Date(timeIntervalSinceNow: -365 * 86_400)
    }
}
