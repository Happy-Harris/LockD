/**
 * Pin the timezone for every test worker. Several engines derive local calendar dates from
 * `Date`, and characterisation snapshots record absolute instants, so a suite that inherits
 * the machine's timezone passes on one laptop and fails on CI (which runs in UTC).
 * Runs in the main process before workers start, so they all inherit it.
 */
export default function setup() {
  process.env.TZ = "UTC";
}
