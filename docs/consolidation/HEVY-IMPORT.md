# Hevy importer contract for PR 7

The two files in `src/test/fixtures/hevy/` were supplied by the owner on 29 September 2026 and explicitly
identified as **synthetic**, using Hevy's real column layout. No real personal
training export is included. The CSV bytes are preserved unchanged.

They are reserved for plan PR 7 (data portability). Their presence is not an
implemented or fully validated Hevy importer.

## Approved importer contract

- Accept `weight_kg` / `distance_km` and `weight_lbs` / `distance_miles`.
- Convert to canonical integer grams/metres, preserving missing values.
- Accept empty or zero external-load cells for bodyweight exercises. Neither is
  evidence of the athlete's body mass; do not fabricate tonnage or muscle mapping.
- Map set types explicitly: `warmup`, `normal`, `failure`, `dropset`; report
  unsupported types instead of silently classifying them as working sets.
- Preserve quoted commas in workout descriptions, exercise notes and timestamps;
  distinguish workouts with the same title using their timestamps.
- Carry distance, duration, RPE and superset information through preview/Resolve.
- Exercise mapping and duplicate review use the approved common import pipeline.
- Verification label: **Verified only against documented and public samples;
  not validated against a real export.** Do not claim comprehensive coverage.
- Only these two CSV files may be committed as Hevy export fixtures. Cover the
  zero-load variant in memory during tests; do not alter these source samples.

## Documentation basis

Hevy's official [Exporting Your Data from Hevy](https://help.hevyapp.com/hc/en-us/articles/43708290987415-Exporting-Your-Data-from-Hevy)
was checked on 29 September 2026. It documents the workout export workflow and
spreadsheet/CSV usage, but does **not** provide a complete versioned column or
set-type schema. The owner's samples supply the concrete column layout; the
importer must not imply that the help article specifies every field.

Before shipping PR 7, recheck official documentation and validate both fixtures,
including blank/zero bodyweight load variants and explicit set-type handling.
