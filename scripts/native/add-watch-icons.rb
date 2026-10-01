# One-off: adds the watch app's asset catalog (the Lock'd icon) to the LockdWatch target.
# Run from the repo root with the `xcodeproj` gem: ruby scripts/native/add-watch-icons.rb
# The icon itself is drawn by scripts/make-icons.mjs. The result is committed; this stays so it can be audited or redone.
require 'xcodeproj'

project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
watch = project.targets.find { |t| t.name == 'LockdWatch' } or abort 'no LockdWatch target'
group = project.main_group['LockdWatch'] or abort 'no LockdWatch group'
abort 'already applied' if group.files.any? { |f| f.path == 'Assets.xcassets' }

catalog = group.new_reference('Assets.xcassets')
watch.resources_build_phase.add_file_reference(catalog)
watch.build_configurations.each { |c| c.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon' }
project.save
puts 'ok'
