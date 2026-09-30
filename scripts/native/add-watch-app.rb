# One-off: adds the Apple Watch companion to the iOS project (Opp 7, native half).
#   - the phone-side plugin to the App target
#   - a watchOS app target "LockdWatch" (watchOS 9+, SwiftUI, WatchConnectivity), embedded in the iOS app
# Run from the repo root with the `xcodeproj` gem: ruby scripts/native/add-watch-app.rb
# The result is committed; this stays so the change can be audited or redone.
require 'xcodeproj'

project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app = project.targets.find { |t| t.name == 'App' } or abort 'no App target'
abort 'already applied' if project.targets.any? { |t| t.name == 'LockdWatch' }

native = project.main_group['App']['Native'] or abort 'run add-rest-timer-widget.rb first'
plugin_ref = native.new_reference('LockdWatchPlugin.swift')
app.add_file_references([plugin_ref])

group = project.main_group.new_group('LockdWatch', 'LockdWatch')
sources = %w[LockdWatchApp ContentView WatchModel WatchSnapshot].map { |n| group.new_reference("#{n}.swift") }
group.new_reference('Info.plist')

watch = project.new_target(:application, 'LockdWatch', :watchos, '9.0', project.products_group, :swift)
watch.add_file_references(sources)

app_config = app.build_configurations.first.build_settings
watch.build_configurations.each do |config|
  s = config.build_settings
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.happyharris.lockd.watchkitapp'
  s['INFOPLIST_FILE'] = 'LockdWatch/Info.plist'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '4'
  s['SDKROOT'] = 'watchos'
  s['SUPPORTED_PLATFORMS'] = 'watchos watchsimulator'
  s['WATCHOS_DEPLOYMENT_TARGET'] = '9.0'
  s['SKIP_INSTALL'] = 'YES'
  s['ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS'] = 'NO'
  s['MARKETING_VERSION'] = app_config['MARKETING_VERSION'] || '1.0'
  s['CURRENT_PROJECT_VERSION'] = app_config['CURRENT_PROJECT_VERSION'] || '1'
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s.delete('IPHONEOS_DEPLOYMENT_TARGET')
end

app.add_dependency(watch)
embed = app.new_copy_files_build_phase('Embed Watch Content')
embed.symbol_dst_subfolder_spec = :products_directory
embed.dst_path = '$(CONTENTS_FOLDER_PATH)/Watch'
build_file = embed.add_file_reference(watch.product_reference)
build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
app.build_phases.move(embed, app.build_phases.index { |p| p.display_name.include?('Embed Pods') } || app.build_phases.count - 1)

project.save
puts 'ok'
