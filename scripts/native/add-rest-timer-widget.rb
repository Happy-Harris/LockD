# One-off: adds the lock-screen rest timer to the iOS project (Opp 6, native half).
#   - the plugin and shared Live Activity files to the App target
#   - a Widget Extension target "RestTimerWidgetExtension" that draws the Live Activity, embedded in the app
# Run from the repo root with the `xcodeproj` gem: ruby scripts/native/add-rest-timer-widget.rb
# The result is committed; this stays so the change can be audited or redone.
require 'xcodeproj'

project_path = 'ios/App/App.xcodeproj'
project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |t| t.name == 'App' } or abort 'no App target'
abort 'already applied' if project.targets.any? { |t| t.name == 'RestTimerWidgetExtension' }

app_group = project.main_group['App']
native = app_group.new_group('Native', 'Native')
shared_names = %w[RestTimerAttributes RestTimerIntents]
app_only_names = %w[LockScreenTimerPlugin MainViewController]
refs = {}
(shared_names + app_only_names).each { |n| refs[n] = native.new_reference("#{n}.swift") }
app.add_file_references(refs.values)

widget_group = project.main_group.new_group('RestTimerWidget', 'RestTimerWidget')
widget_ref = widget_group.new_reference('RestTimerWidget.swift')
widget_group.new_reference('Info.plist')

ext = project.new_target(:app_extension, 'RestTimerWidgetExtension', :ios, '16.2', project.products_group, :swift)
ext.add_file_references([widget_ref, refs['RestTimerAttributes'], refs['RestTimerIntents']])

app_config = app.build_configurations.first.build_settings
ext.build_configurations.each do |config|
  s = config.build_settings
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.happyharris.lockd.RestTimerWidget'
  s['INFOPLIST_FILE'] = 'RestTimerWidget/Info.plist'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['SKIP_INSTALL'] = 'YES'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '16.2'
  s['LD_RUNPATHSEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
  s['MARKETING_VERSION'] = app_config['MARKETING_VERSION'] || '1.0'
  s['CURRENT_PROJECT_VERSION'] = app_config['CURRENT_PROJECT_VERSION'] || '1'
  s['CODE_SIGN_STYLE'] = 'Automatic'
end

app.add_dependency(ext)
embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
build_file = embed.add_file_reference(ext.product_reference)
build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
# Before the CocoaPods embed script, so Xcode does not see a build cycle.
app.build_phases.move(embed, app.build_phases.index { |p| p.display_name.include?('Embed Pods') } || app.build_phases.count - 1)

project.save
puts 'ok'
