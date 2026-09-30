# One-off: adds the HealthKit plugin to the iOS project (Opp 10, native half).
#   - LockdHealthPlugin.swift and SleepIntervals.swift to the App target
#   - App.entitlements (HealthKit capability) wired through CODE_SIGN_ENTITLEMENTS
# Run from the repo root with the `xcodeproj` gem: ruby scripts/native/add-healthkit.rb
# The result is committed; this stays so the change can be audited or redone.
require 'xcodeproj'

project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app = project.targets.find { |t| t.name == 'App' } or abort 'no App target'
native = project.main_group['App']['Native'] or abort 'no Native group'
abort 'already applied' if native.files.any? { |f| f.path == 'LockdHealthPlugin.swift' }

refs = %w[LockdHealthPlugin SleepIntervals].map { |n| native.new_reference("#{n}.swift") }
app.add_file_references(refs)
project.main_group['App'].new_reference('App.entitlements')
app.build_configurations.each { |c| c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements' }
project.save
puts 'ok'
