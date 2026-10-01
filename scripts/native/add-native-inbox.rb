# One-off: adds the durable native inbox (taps that arrive while the web layer is not running) to the iOS project.
#   - PendingActionStore.swift to the App target and to the widget extension (a Live Activity button's intent writes to it)
#   - WatchRelay.swift to the App target (the phone's WatchConnectivity end, started from the app delegate)
# Run from the repo root with the `xcodeproj` gem: ruby scripts/native/add-native-inbox.rb
# The result is committed; this stays so the change can be audited or redone.
require 'xcodeproj'

project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app = project.targets.find { |t| t.name == 'App' } or abort 'no App target'
ext = project.targets.find { |t| t.name == 'RestTimerWidgetExtension' } or abort 'no widget extension target'
native = project.main_group['App']['Native'] or abort 'no Native group'
abort 'already applied' if native.files.any? { |f| f.path == 'PendingActionStore.swift' }

store = native.new_reference('PendingActionStore.swift')
relay = native.new_reference('WatchRelay.swift')
app.add_file_references([store, relay])
ext.add_file_references([store])
project.save
puts 'ok'
