# Visual realism

Public reference: [Microsoft's September 2024 overview](https://www.flightsimulator.com/msfs2024-preorder-now-available/). It describes photogrammetry, detailed elevation and imagery, atmospheric lighting, weather, detailed aircraft and flight-path-based streaming with multiple levels of detail. This is a product overview, not a published implementation of their renderer. Skyward uses its own Cesium implementation; no MSFS SDK, models or scenery were imported.

## Implemented first pass

- Local cloud volumes use Cesium's scene sun instead of a fixed lighting direction. A short density probe adds interior shading; low sun adds warmer highlights. Sampling remains bounded at 10/20 ray steps by quality.
- Aircraft direct light warms near sunset and is attenuated by local weather obscuration near the watched scene. Ambient night visibility remains available.
- High detail enables existing satellite imagery, approximate open terrain and structures. It requests 4x MSAA and 2048-pixel shadow maps. Existing automatic quality reduction remains enabled. These settings do not introduce a new paid service.
- Existing cloud fading, wind drift, scene warmup and tile preloading remain in place.

## Second pass

- Replaced the separate flat local-horizon cloud collection with sun-lit 3D volumes. Distant volumes use six ray steps; near volumes retain 10/20 by quality. Stable cell identities, 2.5-second fades, and at most one/two creations per rendered update reduce abrupt rebuilding. The global weather overview remains a report-derived globe overlay.
- Added procedural facade windows to mapped city and airport extrusions, including terrain-clamped airport polygons. Window detail fades with distance and uses derivative smoothing; local coordinates avoid Earth-scale texture jitter. Exterior shading darkens at night, with a sparse illustrative illuminated-window pattern. No facade is claimed to match a surveyed building.
- Added a conservative paint response to imported aircraft: only bright, opaque, fully matte, non-metallic-looking surfaces gain smoother highlights. Existing glass, rubber, reflective metal and authored roughness remain untouched. Environment reflections refresh with time and position, with reduced saturation under cloud.
- Fixed the model warmup lifetime cap. Selected aircraft take queue priority; completed entries use a bounded recent-use cache. Binary glTF is consumed correctly, request time is bounded, failed loads can retry, and outstanding work is cancelled on disposal.
- Transient weather refresh errors retain a recent report, marked refresh-delayed, while existing age and distance limits still suppress invalid weather.

Validation: production build; 375 passing tests with one skipped; headless Chromium desktop and mobile checks for weather, cockpit, shader compilation, terrain materials, day/night airport views, aircraft selection and closing flight view. Browser screenshots establish rendering correctness, not representative real-GPU frame rate.

## Remaining gap and next priorities

1. Asset quality: detailed, licensed aircraft materials and airport meshes with carefully authored distance levels. Lighting cannot replace missing geometry or textures.
2. Scenery continuity: measure tile/model readiness ahead of the camera, transition distant cloud representations smoothly, and test slow networks. Current preloading cannot guarantee that every remote tile arrives before it is visible.
3. Weather: coherent layered cloud fields and more varied cloud shapes. Current local volumes are bounded procedural approximations, not a global atmospheric simulation.
4. Performance: profile representative desktop/mobile GPUs before increasing cloud sample counts or adding reflections. Browser software-renderer checks establish correctness, not real-device frame rate.

Prefer improvements to one representative flight/airport at a time with screenshot comparisons and frame-time measurements before rolling out more expensive effects globally. This first pass does not claim MSFS visual parity or its worldwide photogrammetry coverage.

## Continuity and detail pass

- Explicitly named glass, rubber, chrome and engine-interior materials receive
  separate roughness/metal response in served/build copies. Alpha, textures,
  authored material extensions and unknown surfaces are preserved. Original
  source models and license files are unchanged.
- Seeded cloud proportions vary silhouettes. Layer-entry haze and fog blend over
  altitude instead of switching at the cloud base. Far cloud samples and resource
  creation are reduced during sustained slow frames; the near aircraft remains.
- Building tiles fade in and out using opaque dithering. Existing look-ahead
  loading continues; background tile concurrency drops under frame pressure.
  Long frames up to one second now count toward automatic quality reduction.
- Decorative short boarding bridges, stand lead-in markings and parked baggage
  carts require mapped terminal/apron/gate relationships and avoid runway areas.
  Detail is bounded and loaded only within 12 km of an airport. Terrain refinement
  updates bridge elevations. These are illustrative props, not observed vehicles
  or surveyed bridges; insufficient geometry produces no placement.
- Sourced landing-gear overlays spin wheels up at contact, let them coast when
  airborne and use damped compression under touchdown/braking. Existing tire
  smoke and contact audio remain. These are presentation effects, not measured
  aircraft suspension or gear telemetry.

The new `test:visual`, `test:scenery` and `test:account-recovery` commands make
these changes repeatable. This pass recorded approximately 150–267 ms median and
200–317 ms p95 frame intervals in headless Chromium software rendering. That is
not smooth rendering and is not a representative hardware-GPU benchmark; no
performance pass or improvement claim is inferred from it. See
[customer readiness](customer-readiness.md) for remaining validation.

## Performance and arrival refinement pass

- **Map tools → Performance → Record performance** captures 30 visible seconds.
  Close the monitor to explore; reopen it to download the result. Cancellation,
  page visibility, viewer disposal and a bounded sample buffer are handled locally.
  Nothing is uploaded or written to the account database. Reports include frame
  percentiles, CPU render-submission wall time, supported browser long tasks,
  enabled model/layer counts and recent quality events. These measurements identify
  possible contributors; they do not measure GPU execution or prove layer causality.
- Automatic quality starts its sustained-frame check after six seconds of warmup
  instead of fifteen. Existing background model/detail limits act first; the
  watched aircraft remains protected. Session reductions do not overwrite saved
  preferences. Disabling automatic quality still disables preset reduction.
- Selected destinations prepare geometry within 150 nautical miles instead of 30.
  With open terrain enabled, destination tiles and points 30/90 seconds ahead
  of the watched aircraft warm at levels 9 and 11 through the bounded cache
  when visible demand leaves capacity. Warming pauses for battery saver and
  hidden/obscured scenes. This does not
  download an entire approach corridor or guarantee all future scenery is loaded.
  Terrain defaults on for new preferences (saved off settings are preserved).
  Visible child failures retry twice, then retain coarser parent elevation; they
  never disable elevation globally. A failed root can use a flat fallback. Detail
  is capped at level 14; decoded cache capacity remains 128 tiles.
- Balanced/high graphics add mapped-runway asphalt grain, illustrative rubber
  deposits and rain-responsive wet patches with a restrained specular response.
  Low graphics omit this layer. It is not measured pavement condition, standing
  water depth or a physically accurate reflection simulation.
- Regenerated original fallback 787 meshes have separate wing nodes and restrained
  flex. Verified A319/A320 engine nodes receive a very small illustrative vibration.
  Other community wing rigs are untouched. Sourced gear overlays now steer the
  nose wheels, complementing existing wheel inertia and braking compression.
- **Sound mix** controls engine, cabin, weather and radio independently. Generated
  cabin audio blends approach and rollout profiles through gain ramps; prerecorded
  cabin files remain one mixed channel. Existing sound switches and autoplay
  restrictions still apply. Safety/cockpit effect chimes retain their own volume.
- A development-only **Flight quality dashboard** in Performance shows bounded
  session events for missing models, terrain/destination failures, sustained frame
  pressure and controlled-arrival transitions. The local capture includes these
  events in production too. This is instrumentation, not a complete physics audit.

Validation uses fixture traffic and software-rendered Chromium. No claim of MSFS
visual parity, guaranteed 60 fps, or validated physical-device performance is made.

## Cloud, water and handling refinement

Microsoft's public descriptions emphasize atmospheric/cloud lighting and a
surface-based aerodynamic model:
[official MSFS 2024 overview](https://www.flightsimulator.com/msfs2024-preorder-now-available/)
and [official aerodynamic documentation](https://docs.flightsimulator.com/msfs2024/flighting/samples-tutorials/tutorials/tuning-the-flight-model/basic-aerodynamics/).
This pass applies a few practical ideas to our existing browser renderer using
original procedural effects. It does not import Microsoft scenery, aircraft,
textures or simulation code.

| Area | Implemented | Practical limit |
| --- | --- | --- |
| Cloud formations | Puffy cumulus, lower stratiform decks, thin high cirrus-like fibers and storm anvils; per-layer thickness shared by weather effects | Types and thicknesses are illustrative heuristics from station cover/base/precipitation, not observed 3D cloud structure |
| Cloud lighting | Scale-correct sun-facing normals, forward light scattering, interior shadowing and restrained finer erosion | Bounded ray marching, not full volumetric multiple scattering |
| Flying between clouds | Camera haze follows visible volume interiors instead of covering an entire altitude layer; clear gaps remain clearer | Interior density is a conservative analytic approximation of the visual volume |
| Water | Gradually changing wind roughness/speed, restrained whitecaps, view-angle sky reflectance and day/night specular response | No geometric swells, exact water depth, measured sea state or scene reflection tracing |
| Advanced controls | Pitch exchanges kinetic/potential energy even under power; banking adds induced drag/sink; reduced induced drag near the surface | Gameplay approximation; no full surface airflow solver, CFD, aircraft calibration or navigation certification |
| Rendering | Automatic scene-resolution reductions under sustained pressure, slow recovery, idle-frame exclusion and explicit manual override | Lower bound 0.7×; interface resolution unchanged; actual hardware performance remains unverified |

Easy assistance and existing ground-contact interlocks remain intact. Dynamic
resolution shares the existing automatic-quality checkbox; disabling it restores
the selected preset's scene resolution. Battery saver keeps its own fixed budget.
The Performance monitor, local captures and problem snapshots report the current
resolution. Cloud sample budgets stay bounded (10 low, 16 normal, 4–6 distant);
near samples reduce to 12 under pressure. No new paid service or database writes
are introduced.

### Speech clarity and continuity

Captain/tower speech and cockpit altitude callouts temporarily soften ambient engines, cabin noise and weather. Separate speech ownership prevents overlapping callbacks from prematurely restoring levels; completion, cancellation, teardown and a 45-second safety timeout release the temporary mix. Persisted mixer values and warning tones remain unchanged. Local speech failures retain visual cues/transcripts. Sound presets and an eight-message, in-memory dialogue history make these controls easier to use.

A calmer-ride announcement requires a prior turbulence onset and 30 continuous seconds below the recovery threshold with current, nearby weather and a known altitude. Missing/stale data resets the calm interval; ground state clears it. It does not claim the seat-belt sign is off or that actual turbulence has been measured. Adaptive resolution also discards performance streaks after inactive sampling gaps, avoiding changes driven by pre-pause samples.
