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
