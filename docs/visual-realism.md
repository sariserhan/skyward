# Visual realism

Public reference: [Microsoft's September 2024 overview](https://www.flightsimulator.com/msfs2024-preorder-now-available/). It describes photogrammetry, detailed elevation and imagery, atmospheric lighting, weather, detailed aircraft and flight-path-based streaming with multiple levels of detail. This is a product overview, not a published implementation of their renderer. Skyward uses its own Cesium implementation; no MSFS SDK, models or scenery were imported.

## Implemented first pass

- Local cloud volumes use Cesium's scene sun instead of a fixed lighting direction. A short density probe adds interior shading; low sun adds warmer highlights. Sampling remains bounded at 10/20 ray steps by quality.
- Aircraft direct light warms near sunset and is attenuated by local weather obscuration near the watched scene. Ambient night visibility remains available.
- High detail enables existing satellite imagery, approximate open terrain and structures. It requests 4x MSAA and 2048-pixel shadow maps. Existing automatic quality reduction remains enabled. These settings do not introduce a new paid service.
- Existing cloud fading, wind drift, scene warmup and tile preloading remain in place.

## Remaining gap and next priorities

1. Asset quality: detailed, licensed aircraft materials and airport meshes with carefully authored distance levels. Lighting cannot replace missing geometry or textures.
2. Scenery continuity: measure tile/model readiness ahead of the camera, transition distant cloud representations smoothly, and test slow networks. Current preloading cannot guarantee that every remote tile arrives before it is visible.
3. Weather: coherent layered cloud fields and better distant-cloud shading. Current local volumes are bounded procedural approximations, not a global atmospheric simulation.
4. Performance: profile representative desktop/mobile GPUs before increasing cloud sample counts or adding reflections. Browser software-renderer checks establish correctness, not real-device frame rate.

Prefer improvements to one representative flight/airport at a time with screenshot comparisons and frame-time measurements before rolling out more expensive effects globally. This first pass does not claim MSFS visual parity or its worldwide photogrammetry coverage.
