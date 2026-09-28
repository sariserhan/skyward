# Skyward flight observatory

A customer-preview flight observatory. React + Cesium render a satellite globe
and a lightweight atlas; a Node server queries ADSB.lol. No account or key is
required for the current local preview. Public launch requirements are below.

## Run locally

Use Node 24 or newer. From this directory:

```sh
npm ci
npm run build
npm start
```

Open **http://localhost:8000/**. `/watch/` redirects to this homepage. Keep the server running.
The exported Godot game is at **http://localhost:8000/airport-simulation/** when
`../dist/web` exists; a small footer button links to it. This routing change requires
restarting an already-running Node server. Observatory assets remain under `/watch/`.
Port 8000 must be available. `PORT` and `HOST` can override the server binding.
For frontend development, keep the Node server running and use `npm run dev`;
Vite proxies `/api` to port 8000.

## Use

- Satellite imagery is the default. Open Layers for the Atlas fallback, airport structures, gates/labels, and reference grid. Preferences are saved on this device. Imagery is historical photography, not live video. The scale is approximate at the bottom-center latitude.
- Use the help button for touch, mouse and keyboard instructions. Aircraft selection is independent from camera following.
- Airport facilities can be filtered by name; traffic can be filtered to ground or airborne observations. These filters never infer scheduled arrivals or departures.

- Choose Dulles (IAD) or Istanbul (IST) for observations within 100 nautical miles.
  Click its map marker or airport card to open mapped facilities and live nearby traffic. The airport panel shows observations within 5 nautical miles; the sidebar retains the 100-nautical-mile airspace.
- Select an aircraft to inspect its reported position, altitude, ground speed, heading, type and callsign. Selection leaves the camera free. Press Follow to lock on, and drag/scroll or press Following · stop to release it. Switch between 3D globe and 2D map.
- Drag with the left mouse button (or one finger) to spin/pan. Scroll or pinch to zoom; right-drag, middle-drag or Ctrl-drag to tilt/orbit. Buttons rotate left/right, restore north and toggle overhead/tilted views. Focus the canvas for arrow-key rotation, +/- zoom, N for north and T for tilt. Double-click no longer silently enables tracking.
- In airport view, choose a runway, terminal or gate to zoom to its mapped position. Gate markers and building/runway surfaces are clickable. Map clicks on overlapping airport/aircraft markers favor airports at globe scale; use the aircraft list for individual flight selection.
- Filter Turkish Airlines locally, or enter an exact ATC callsign, registration,
  or ICAO hex and press Search worldwide. Ticket flight numbers can differ from
  ATC callsigns. A nearby aircraft is not necessarily arriving at that airport.
- Star an aircraft to save its identifier in this browser. During the current
  session, recorded fixes can be replayed and downloaded as JSON. This is not a
  historical flight archive. A watch follows an airframe identifier, which can
  operate different flights later.

## Data and limitations

Positions refresh about every 25 seconds while the page is visible. Requests are
shared, cached for 20 seconds, serialized with at least 1.1 seconds between query
starts, and use a 12-second timeout. Failed feeds retain the selected observation
with its original timestamp. Aircraft do not move through coverage gaps. Last
fixes become amber after 30 seconds and show a signal gap after two minutes.
Trails omit missing altitude and break across gaps longer than two minutes;
replay steps through recorded fixes without inventing movement. Trails are
bounded to 250 aircraft and 1,440 points each; up to 30 identifiers are saved.

The position feed does not provide confirmed routes, destination, ETA or gate assignments. Selecting a callsign now performs a separate ADSB.lol route lookup; its origin, destination and any intermediate stops are labeled as a callsign route record, not a confirmed current flight plan. A dashed route line is an estimate, not an observed track. Position mismatches are called out and not drawn. If the plausibility service fails, the provider’s own public Virtual Radar Server standing-data service is used, explicitly UNVERIFIED; unavailable routes stay unavailable. Route responses are cached for five minutes and the failed plausibility service backs off for one minute. No paid provider or key was introduced.
Runway alignment is a geometric estimate and is explicitly labeled as inferred.
Reported barometric altitude is used for visualization, not surveyed height.
The generic aircraft mesh and extruded building heights are illustrative, not
exact replicas. Istanbul now includes six OurAirports runways plus OpenStreetMap gate nodes, taxiways, aprons and building footprints. Dulles has four mapped runways and 130 mapped gates; Istanbul has 87 mapped gates. These are mapped features, not a guarantee of complete airport inventory or live gate occupancy. Ocean and
surface receiver coverage may be incomplete. No historical takeoff can be shown
unless this session observed it.

The community API has dynamic rate limits and no availability guarantee. The
current provider source describes free access and possible future API-key
requirements. Satellite tiles come directly from Esri World Imagery, with the
service's current attribution displayed by Cesium. This is an externally hosted
basemap; public accessibility is not evidence of unrestricted commercial rights.
No paid account, Cesium ion terrain, or production imagery entitlement is configured.
The atlas remains available on imagery failure; Retry imagery reconnects without
losing the selected airport. The default globe uses an ellipsoid; optional Open terrain streams approximate elevation without a key or account. It is not surveyed airport terrain.

## Customer preview and public launch

The application is ready for local customer demonstrations, not yet an operated
public service. Before public launch:

1. Confirm imagery/service entitlements for the intended use and traffic with
   [Esri](https://www.esri.com/en-us/legal/terms/data-attributions), and confirm the
   [ADSB.lol API terms and capacity](https://github.com/adsblol/api/blob/main/src/adsb_api/app.py).
   Preserve ODbL attribution and distribution obligations for derived airport data.
2. Choose a host/domain, put HTTPS and edge rate limiting in front of the Node
   service, and configure process restarts and request/error monitoring. The
   built-in limit is 60 API requests/minute per socket IP; behind a proxy that is
   the proxy's IP. Do not blindly trust forwarded IP headers. Configure edge limits
   and a trusted-proxy strategy before serving multiple users.
3. Monitor `/healthz` for app availability. It verifies the entry asset and server,
   **not** the feed or imagery provider. Add separate low-frequency upstream and
   browser synthetic checks. Do not poll upstream through every health check.
4. Load-test the chosen host against the expected concurrent audience and verify
   current Safari/Firefox and real mobile GPU behavior. The local verification
   uses Chromium with desktop and mobile viewports, not physical devices.
5. Set a support contact and customer terms/privacy information for the chosen
   operator. There is no invented company identity, billing or user account system.

The server now sends nosniff, same-origin frame protection, a referrer policy,
and disabled camera/microphone/geolocation permissions. Hashed frontend assets
are immutable; entry HTML is not cached. Provider requests are deduplicated,
limited to 16 queued/in-flight distinct requests, and expire after 15 seconds in
the queue. Overload returns an explicit error. SIGTERM/SIGINT drain connections
with a 10-second shutdown deadline. Feed/route browser requests time out at 25
seconds, geometry at 20 seconds, and the app has a recoverable error screen.
Watchlists and layer preferences are stored in browser localStorage. There are no
analytics trackers; imagery requests expose the viewer's IP to the imagery service.

No public deployment or provider agreement was performed as part of this pass.

## Sources and attribution

- [Esri World Imagery](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer): source attribution is read from live service metadata and shown on screen. Photography dates and maximum detail vary; no tiles are bulk-downloaded or redistributed.

- [ADSB.lol API](https://www.adsb.lol/docs/open-data/api/): observations under ODbL.
  Data attribution is visible in the app and included in downloaded trails.
- [OpenStreetMap](https://www.openstreetmap.org/copyright): Dulles building,
  apron, taxiway and gate geometry under ODbL. Source snapshot and transformation
  are available in `../game/configs/geodata/dulles-osm.json` and
  `scripts/prepare-geography.py`. Derived airport geometry is provided as
  `public/data/airports.json` under the same ODbL terms for its OSM-derived parts.
- FAA Dulles runway thresholds: see [Dulles provenance](../docs/dulles.md).
- Istanbul OpenStreetMap airport-area snapshot: `public/data/istanbul-osm.json`, retrieved September 26, 2026 from the [OSM map API](https://api.openstreetmap.org/api/0.6/map?bbox=28.70,41.245,28.78,41.31), ODbL-1.0; exact footprint geometry retained, building heights illustrative. Regenerate both airports with `python3 scripts/prepare-geography.py`.
- Callsign routes: [ADSB.lol route API source](https://github.com/adsblol/api/blob/main/src/adsb_api/utils/api_routes.py), backed by Virtual Radar Server standing data.
- [OurAirports](https://ourairports.com/data/): public-domain Istanbul runway
  snapshot from `runways.csv`, airport LTFM, retrieved 2026-09-26; retained in
  `public/data/istanbul-runways.json`.
- [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/):
  public-domain 1:110m country polygons, `ne_110m_admin_0_countries.geojson`,
  retained in `public/data/world.geojson`.
- CesiumJS is bundled locally under Apache-2.0; its distributed license notices
  remain with the copied assets. `scripts/make-aircraft.py` creates our generic
  aircraft mesh locally.

## Validation and maintenance

`npm test` checks feed normalization, preserved timestamps, query validation,
request deduplication, error handling, trail gaps, runway inference, route validation and standing-data fallback semantics. HTTP tests verify readiness, headers, HEAD behavior, path containment, invalid inputs and rate-limit retry hints; queue tests verify overload and expiry without provider calls.
`npm run build` performs strict TypeScript checks and a production build.
Geography and the generic mesh can be regenerated with the two Python scripts in
`scripts/`. `npm run prepare:assets` copies the installed Cesium runtime locally.
The visual concept and implementation tokens are in `design/`.


## No-payment exploration release

- **Show full route** frames the aircraft and both endpoints of an available two-airport callsign route. Multi-leg ambiguity and mismatches still prevent treating a route as the current itinerary.
- **Facility categories** narrow terminals, runways and gates. Selected facilities receive a mint marker and footprint/runway outline; a gate highlights its location, not an invented gate polygon.
- **Traffic on map & list** filters ground, airborne, below 10,000 ft, and higher aircraft. An explicitly selected aircraft remains visible even when it does not match. Labels reduce with zoom; pointer hover shows identity and last-fix information.
- **Share view** copies an airport, facility or aircraft link, including 2D/3D mode. Links restore current observations; they do not archive positions or expose a local server publicly. A localhost URL works only on the same computer.
- **Local watch alerts** opt-in monitors the five most recently saved aircraft, sequentially about every six seconds (normally each aircraft every 30 seconds), only while the page is visible. First observations establish a baseline. New contiguous ground-to-airborne observations, entry within 5 nm of IAD/IST, a two-minute position gap, and fresh-position recovery create local alerts. There is no SMS/email/push provider, background guarantee, or confirmed takeoff/arrival claim. The last 40 events remain in this tab's session.
- **Session replay** freezes a snapshot of the selected aircraft's collected trail and steps through real fixes. Speed is fixes/second, not real-time movement. The scrubber uses observation timestamps; amber spans mark gaps over two minutes. Live collection continues independently. Return to live reconnects the display to the latest report.
- **Aircraft models** are locally generated original family silhouettes: narrowbody, widebody, jumbo, regional, and generic fallback. The reported type selects the family; there are no downloaded proprietary models or invented airline liveries. Regenerate with `python3 scripts/make-aircraft.py`.
- **Open terrain** in Layers uses the [Mapzen Terrain Tiles open dataset](https://registry.opendata.aws/terrain-tiles/), without an AWS account, key, trial, or payment setup. Fetching is opt-in, capped at six parallel tiles and 128 decoded cached tiles. Tiles are resampled to 65×65 heights and capped at level 12; negative bathymetry is displayed as sea surface. Approximate elevations are used directly, without geoid/datum conversion. This is visual relief, not an altitude/clearance calculation. Buildings use mapped footprints and illustrative extrusion heights relative to the terrain; runway/gate overlays clamp to the surface. A failed tile switches the scene to the flat globe with an explicit message. The 2D view stays flat. Contributor attribution is linked on the map and retained in `public/terrain-attribution.txt`.
- **Feed health** reads local aggregate counters, latest position-payload time, cache hits, pending work, provider errors, and mean upstream response time. It does not add upstream polling. `node scripts/check-health.mjs` checks once; add `--watch` to print JSON health every 60 seconds. Override `SKYWARD_URL` to monitor your own accessible host. No monitoring account or remote logging service is used.

Confirmed itineraries, gate assignments, exact photogrammetric buildings, and operational alerts are not available from the configured free feeds. Those remain unavailable rather than being guessed. No new recurring cost, account or subscription was created. Existing imagery remains subject to its provider terms; public-service operating requirements above still apply.

### Worldwide major-airport coverage

The airport browser searches a shared OurAirports catalog by IATA/ICAO code,
name, city, or country. “Major” currently means `large_airport` with
`scheduled_service=yes`, plus the original IAD/IST maps. It is a source
classification, not a passenger-volume ranking or a claim to include every
commercial airport. The initial import contains 1,152 airports in 217 country
codes/territories and 1,685 mapped runway records.

Only the selected airport's geometry is downloaded, with an eight-airport
browser memory cache. Switching airports cancels pending geometry/feed requests.
The backend accepts airport identifiers from the same catalog and queries the
existing 100 nm feed around that airport. The inspector shows reported traffic
within 5 nm. Searching/browsing the directory makes no provider calls. No worldwide
traffic polling is introduced. Aircraft selection and opt-in watch monitoring
retain their existing separate requests.

Runway rows marked closed are excluded. Records missing usable endpoints,
positive width or length are omitted; 83 runway rows were omitted in this snapshot.
The affected airports explicitly show partial/unavailable runway coverage.
A zero mapped gate/building count means no mapped features were included, not
that the airport has no gates/buildings. Facility counts do not establish
completeness or operational status. Nearby observations are not a flight schedule
or confirmed arrival/departure list.

Rebuild the directory and runway assets with:

```sh
python3 scripts/import-airports.py
```

`data/airport-import.json` records the retrieval time, exact source URLs and
SHA-256 hashes, selection rule and runway omissions. `data/airport-catalog.json`
is shared between client and server. Per-airport assets are in
`public/data/airports/`. Source data: <https://ourairports.com/data/> (public domain,
no accuracy guarantee). The original IAD and IST geometry remains sourced from
its existing snapshots.

Add/refresh a small batch of detailed hub maps with:

```sh
python3 scripts/import-airport-facilities.py LHR JFK SIN
# Explicitly replace successful cached OSM snapshots:
python3 scripts/import-airport-facilities.py LHR --refresh
npm run build
```

The importer queries features inside an OSM `aeroway=aerodrome` area with the
matching ICAO identifier. It stores raw responses and exact queries, hashes,
source dates and ODbL attribution under `data/osm/`. It imports closed simple
building footprints, mapped gate nodes, aprons and taxiways. Complex relations
and open footprint ways are counted as omitted; heights remain illustrative.
Coverage is always partial. Empty/missing source areas are not evidence of no
facilities. The importer spaces requests and stops on HTTP 429; re-run later to
reuse successful snapshots. Do not bulk-import the full catalog against the
public service. Runtime visitors use local snapshots and never query Overpass.
Restart `npm start` after a catalog refresh so backend coordinates match the build.
The free flight feed's existing capacity and commercial imagery terms still apply.

Detailed coverage is available for **16 hubs**: AMS, IAD, IST, ATL, CDG,
DFW, DOH, DXB, FRA, HND, ICN, JFK, LHR, MAD, ORD and SYD. The first
20-hub batch is not fully imported: HKG, LAX, SIN and GRU still timed out
on their latest retries. Their directory, traffic and available runway maps
work. `data/facility-import-status.json` records actual outcomes. No incomplete
import is reported as complete facility coverage.

### Exploration tools release

Open **Explore tools** in the footer for:

- **Airport:** an overhead overview fitted to all mapped runway endpoints,
  terminal polygons and gates; terminal/runway shortcuts; the eight closest
  major airports by great-circle distance. This directory does not cover every
  small airfield.
- **Activity:** opt-in blue approach and dashed orange departure-candidate
  trails, plus a keyboard-accessible per-minute activity chart. Candidates need
  three fresh, contiguous airborne observations spanning at least 20 seconds,
  a consistent radial trend of at least 0.5 nm and a current range within 20 nm.
  Flyovers remain possible. These are not confirmed landings/takeoffs.
- **Compare flights:** two observed targets or identifier lookups, reported
  altitude/speed/age, callsign route records and separate observed-altitude
  trails. Route uncertainty and disconnected trail gaps remain explicit.
  Comparison adds at most two position lookups per 25-second cycle while the
  comparison panel is open and visible, using existing server caching/limits.
- **Coverage:** searchable, paginated airport metadata with mapped counts,
  omissions, partial/unavailable coverage and snapshot dates. It loads the
  lightweight coverage index on demand, not all airport geometry.
- **Collections:** up to 20 named local collections, 50 airports each. Storage
  failures are shown; no account or cloud synchronization is added.
- **Accessibility:** reduced camera motion, larger controls/map labels and
  higher contrast. System reduced-motion preference supplies the initial
  setting. Native controls, keyboard chart navigation and dialog focus return
  remain usable without interacting with the globe canvas.

Activity is collected only from successful selected-airport responses. Each
minute counts distinct fresh targets within 5 nm, separated into aircraft,
vehicles, fixed objects and unknowns. Cached or out-of-order source timestamps
do not add samples. A successful empty observation is zero; a minute without
samples is a gap. Counts are not operations, passenger counts, or complete
airport traffic. History is session-only and bounded to 120 sampled minutes
per airport, at most eight airports; collection stops when the page is hidden.

The feed now preserves the reported emitter category and a conservative target
class. Known surface-vehicle/obstruction categories and provider `GRND`/`TWR`
type metadata are distinguished from aircraft. Callsigns and stationary positions
are not used to guess classes. Unknown/reserved categories remain unclassified.
Surface vehicles and fixed objects do not receive aircraft meshes, inferred
runway assignments or flight-route lookups. The source field format is documented
by [readsb](https://github.com/wiedehopf/readsb/blob/dev/README-json.md).

`npm run build` regenerates `public/data/coverage.json` from the per-airport
snapshots using `scripts/prepare-coverage.mjs`. The latest retry successfully
added **MAD, HND and AMS**; detailed facility coverage now spans **16 hubs**.
HKG, LAX, SIN and GRU still lack imported facilities after repeated source timeouts. Consult `data/facility-import-status.json` for actual outcomes.


### Passenger flight view

Select a positioned aircraft, then **Flight view** in 3D mode. Chase, side and orbit cameras follow the presentation; dragging releases the camera. Route fits the estimated two-airport route when available. World/airport navigation closes the presentation. The ordinary inspector returns on closing; stepwise session replay stays separate.

The selected aircraft uses one of 19 original illustrative mesh profiles (Airbus A319/A320/A321/A220/A330/A350/A380; Boeing 737/737 MAX/747/757/767/777/787; regional/business jets, turboprop, light aircraft and generic), with engines, windows, cockpit and illustrative gear. Nearby unselected traffic retains inexpensive symbols. Type variants map to the nearest supported profile. Fifteen callsign-prefix paint palettes plus neutral fallback are **airline-inspired**, not exact registration-specific liveries. Supported operators now have source-tracked logos on the tail/fuselage and in the flight panel. Regenerate with `npm run prepare:fleet`; shared binary buffers avoid repeating geometry for each paint palette. No purchased assets, new paid API or account was introduced.

The normal flight view interpolates only received fixes with a 30-second visual delay. It does not bridge gaps longer than two minutes or extrapolate past the last fix. Reported metrics and observation timestamps stay separate from visual position. Reduced motion shows the latest fix and disables automatic orbit. Unknown altitude/position and non-aircraft targets do not enter flight view.

Expand **Takeoff / landing demonstration**, select a mapped runway and choose a demo. These are 45-second illustrative sequences with play/pause, reset, scrub and return controls. They use a separate entity, visibly labeled SIMULATION; they never create observations, alerts, real routes, runway assignments or real gear-state claims. Demo height uses available approximate elevation at the runway start, not surveyed runway geometry. Playback pauses when the page is hidden; reduced motion starts paused. Airport geometry may be incomplete.

Validation: 47 Node tests cover existing behavior plus interpolation, coverage gaps, dateline motion, asset mappings and runway rollout bounds. Chromium/Playwright exercises desktop/mobile layout, profile loading, cameras/drag release, route view, demo playback/pause/scrubbing, restoration, navigation cleanup and target exclusion. Browser fixtures use synthetic TEST callsigns, not evidence of live flights. Firefox/WebKit were not verified in this environment. Existing bundle-size and classic Cesium script build advisories remain.


### Aircraft detail and geographic context update

The fleet generator now builds smooth fuselages, solid wings/fins, nacelle lips, recessed fans, curved cabin windows, cockpit panels, MAX split tips, 787 raked tips and the 747 upper-deck profile. Type-code mappings distinguish common Boeing/Airbus families and avoid depicting known light aircraft/turboprops/business jets as a narrowbody. Dimensions, nearest-family variants, cabin/gear details and paint placement remain illustrative. Mesh URLs are versioned to avoid stale cached first-generation assets.

Opening flight view hides observed trails, movement overlays and estimated route lines; closing restores ordinary map overlays. The **Area** camera provides an overhead region view. Natural Earth 1:50m populated places supplies 1,251 city reference points, ranked by zoom and decluttered on screen. **Layers → Cities, gates & labels** controls visibility. The flight panel reports distance/direction from the nearest reference city using the reported aircraft coordinates; it does not claim that the aircraft is directly over that city. Oceanic positions may be far from any reference city. Simulations do not display the live position reference.

Logo source: https://github.com/Jxck-S/airline-logos (radarbox_logos). Per-file URLs, retrieval date and hashes are in `public/airlines/sources.json`. Airline marks remain owned by their respective owners; source identification-use notices are not a blanket commercial brand license. Unknown operators use neutral paint and no invented logo. City source: https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-populated-places/ (public domain). Assets are served locally, with no new paid service or runtime branding/geocoding API.


### Local atlas cartography

Atlas now uses a custom Cesium imagery provider that rasterizes local Natural Earth 1:50m data: 1,620 land polygons, 412 lake polygons and 895 river line parts, with zoom-filtered country names and city labels. It retains polygon holes, uses shared geographic tile boundaries, bounds-checks features, simplifies subpixel segments and caches at most 64 canvases. The regional atlas loads only when selected or needed after satellite failure; it requires no tile subscription or third-party tile requests. Ground haze is disabled in atlas mode for readable geography. Satellite mode retains atmosphere and its existing imagery source.

The original coarse land layer remains available during loading or failure. The atlas legend exposes loading, failure and retry states. Airport snapshots remain separate and selectable above the map. This is regional reference cartography, not street mapping; roads, precise coastlines at building scale and current administrative changes are not asserted. Regenerate source-tracked data with `python3 scripts/prepare-atlas.py`; the source URLs, hashes and public-domain license are recorded in `public/data/atlas-v2.json`.

Validated: 49 Node tests and a production build; Chromium desktop/mobile world, regional, airport and 2D views; country/city labels and toggles; atlas loading failure/retry and satellite fallback. Firefox/WebKit remain unverified in this environment.


### Camera-area traffic

Map markers and the airspace browser now follow the camera instead of the selected airport. Cesium samples the visible Earth footprint, recenters after camera movement, and periodically updates during continuous following. Queries are debounced, use 0.1-degree centers and 25-nm radius buckets, and refresh every 35 seconds while visible. The selected-airport feed remains separate for airport inspection and its activity history; camera-area records do not contaminate airport-specific activity metrics.

`GET /api/area?lat=41&lon=29&radius=100` validates finite coordinates and an integer radius from 1–250 nm, then uses the existing serialized, bounded, shared provider cache. Provider schema: https://api.adsb.lol/api/openapi.json. Wider regional views add up to four overlapping query circles toward nearby viewport samples (five circles total, 250 nm maximum radius each). Far-away/global samples are not queried; wide views remain explicitly partial, not complete world coverage. Queries run sequentially through the existing cache with a 900 ms camera debounce, and stop when the page is hidden. Receiver gaps remain possible. Filters remain active until cleared. No extra subscription or key is required.

Requests from departed camera areas are aborted and late results ignored. Successful empty results clear previous targets; failed refreshes retain only previously observed targets in the current area with their original timestamps. Duplicate identifiers and older fixes cannot overwrite newer fixes. The HUD reports camera center, query radius, snapshot time, loading/error state and wide-view limits. Older running servers show an explicit restart message instead of silently showing no aircraft.

This release changes server code: restart the existing `npm start` process once, leaving the SSH tunnel open. Validation: 53 Node tests and production build; controlled Chromium camera changes, old-area removal, outages, empty snapshots, wide-view limits and old-server guidance. A separate test server returned real Istanbul aircraft; browser verification showed 31 aircraft/map entities while IAD remained selected (a time-specific snapshot, not a guaranteed count). Desktop/mobile screenshots are QA artifacts, not forecasts of current traffic.


### Expanded explorer controls

- **Flight filters** in the sidebar apply jointly to the globe and list: operator callsign prefix, model/family text, altitude and ground-speed ranges. Null measurements do not match active numeric filters. Observed approaching/moving-away filters require three recent, consistent fixes within 20 nm of the selected airport; these are not confirmed arrivals or departures. A selected aircraft remains visible until deselected, even when filters exclude it.
- **Flight view → Location map** provides a regional/world mini-map with locally served Natural Earth coastlines, city references and estimated-route airport markers. Its arrow shows the reported position; the main 3D aircraft may be visually interpolated 30 seconds behind. No flight route lines are added to the cinematic view. Mini-map coastlines failing to load leave an explicit coordinate-grid fallback.
- **Airport details → Tower view** offers synthetic viewpoints beside any mapped runway, plus opposite-side, runway selection and camera reset controls. Height is illustrative (65 m above available approximate terrain); no claim about the real tower location is made. Camera traffic uses a 25 nm airport area in this mode.
- **Layers → Graphics** offers Low/Balanced/High and label decluttering. Low uses reduced resolution, smaller distant markers and no nearby interpolation. Balanced/High animate at most 100/240 nearby aircraft within 100 km and show at most 10/24 nearby models within 4 km. Other targets retain reported-position markers. Animation interpolates received fixes only, freezes at the final fix, rejects gaps over two minutes, and stops when hidden or reduced motion is enabled. These are rendering budgets, not data-count truncation.
- **Connection health** separates the browser network hint, app server/tunnel reachability, provider counters and per-camera-area outcomes. Retry, diagnostic text and clipboard copy require no external account. Failed areas retain only previous observations outside successfully refreshed circles. A successful empty response removes disappeared targets. No failed region is presented as successfully refreshed.
- The v3 fleet has **26 illustrative profiles** and **24 operator paints/logos**. Additions include shorter/longer 777/787 and A350 variants, E-Jets, rear-engine CRJs and single-engine PC-12s, painted nacelles and lower-body accents. New logos identify Ryanair, easyJet, Wizz Air, Singapore Airlines, Cathay Pacific, ANA, JAL, Qantas and Air Canada. These are approximate family proportions and paints, not registration-specific replicas. Per-logo provenance remains in `public/airlines/sources.json`. Run `npm run prepare:fleet` to rebuild local geometry; this command does not fetch external assets.

This update changes frontend code/assets only. Rebuild with `npm run build`, then refresh the existing `/watch/` page. The server and SSH tunnel do not need restarting for these frontend changes. No paid service, account, authentication, billing, or subscription was added.

### Sourced aircraft models

Matching observations now use **38 aircraft-specific community models** from the [Flightradar24 / FlightGear collection](https://github.com/Flightradar24/fr24-3d-models), pinned to `dd53267690c6a4ecbb290a3acf0284333a5d68a9`. These are community representations of real aircraft types, not manufacturer CAD files. The catalog includes Airbus A318–A321, A330/A340 variants, A350-900, A380; several Boeing 737/747/757/767/777/787 variants; CRJs, E-Jets, A220s, Q400, ATR 42, Citation II, PA-28, A300-600ST Beluga, ASK 21 and BAe 146. BAe 146 variants are labeled family matches.

`src/lib/sourcedAircraft.json` records explicit type mappings. B77W/B77L are labeled family matches to the source 777-300/777-200 models. MAX and A350-1000 use labeled family matches; types without a suitable asset retain a clearly labeled approximate fallback. We do not silently stretch another model into those variants. Supported callsign prefixes select airline-colored fins with the operator's logo on both sides of the sourced aircraft. The remaining source paint is retained. These identify 24 supported operators and are illustrative, not registration-specific liveries. Unknown operators retain the original source paint. Source gear poses are static; takeoff/landing demos still animate the explicitly simulated flight path.

`npm run import:aircraft` downloads and verifies the pinned Git object hashes, imports the original GLBs, converts legacy glTF to glTF 2.0 using the installed Cesium converter, and applies only rigid coordinate alignment / horizontal centering. Original geometry and materials are retained, subject to the legacy material conversion. Every imported model was loaded through Cesium during validation; common types were also inspected in flight view on desktop/mobile. No extra package, service, account, or payment was added.

The GPLv2 license, upstream author credits, original assets, corresponding `.blend` / archive sources, and a SHA-256 provenance manifest are shipped under `public/models/sourced/`. See `manifest.json` for exact source URLs and editable-file paths. The complete source distribution, including branded variants, is stored locally; browser clients fetch rendered models on demand, and never automatically download the editable sources. Credits and source links are available in Flight view and About the data. The existing server can serve the new build without restarting.

`npm run prepare:branding` regenerates all 62 × 24 tail-branded variants after importing models. Surface overlays follow the original fin geometry; original aircraft meshes and unmodified logo PNGs are preserved. Shared binary buffers avoid duplicating aircraft geometry for each operator. The branding generator and placement manifest ship alongside the derivatives under `public/models/sourced/branded/`. Embedded images have a single glTF image source, preventing shared placeholder URLs from causing cross-model texture cache collisions.


### Flight presentation, coverage and rendering update

- Flight view measures the information panel and frames the aircraft in the remaining desktop/mobile space. Chase, side and orbit settle smoothly, the distance slider changes framing, and details can be collapsed. Dragging/wheeling releases the camera. Reduced motion stops automatic orbit and demo playback.
- Twelve pinned, GPLv2 community full-aircraft liveries replace tail overlays for compatible combinations: B738 THY/UAL/AAL/DAL/KLM/RYR/QFA and A320 AFR/BAW/DLH/EZY/UAL. Original texture PNGs are unchanged and include fuselage, fin and nacelle artwork where present. These are historical/community paint schemes, not verified live registrations. `public/models/sourced/liveries/manifest.json` records source hashes, licenses and paths. Run `npm run import:liveries` after `npm run import:aircraft`; run `npm run prepare:branding` for the remaining operator variants.
- The v4 fallback fleet includes separate axle-centered wheel meshes and a gear parent. In demos, gear retracts progressively after liftoff and extends before touchdown. Wheels animate only in moving, unpaused ground illustrations (or a recent reported ground fix); reduced motion and stale fixes stop the animation. These are presentation estimates, not measured gear or RPM. Sourced models have no verified gear rig and remain static in that respect.
- Coverage shows recent (≤30s), aging (≤120s), old/unknown observations, successful region counts, fetch and position age, partial outages, empty results and sampled wide-area limits. These counts describe observations and requests, never the fraction of real aircraft detected.
- Detailed sourced models load only for the selected aircraft within 6 km. Nearby aircraft use shared lightweight meshes, capped at 3 in Balanced and 8 in High within 2 km; Low disables nearby meshes. ModelGraphics survive position updates, distance fades blend models into symbols, and distant traffic retains markers. Buffers are shared across liveries and operators; source archives are never automatically downloaded.
- Layers provides clear aircraft lighting or natural sunlight/night. Shadows are enabled only in High detail with a bounded 1024px / 10km shadow map. Other quality modes avoid shadow work. No new package, account, paid API, or purchased asset was introduced.

The remaining model gaps (including exact MAX/A350-1000 and 777 ER/LR geometry) are explicitly labeled. They require compatible, verified source assets; this update does not relabel a different airframe as an exact variant. The existing port-8000 server serves the rebuilt frontend without restarting.


### Discovery, history, gallery and offline tools

Open **Explore tools** in the footer:

- **Discover** offers nearby aircraft, a random fresh flight, and airport activity ranked only from recent observations already received. This is not a complete global ranking. Non-aircraft, stale and invalid observations are excluded.
- **Traffic board** filters aircraft within 20 nm of the selected airport, with a separate ground filter within 5 nm. Approaching/moving-away labels require multiple consistent fixes and remain explicitly inferred. Search supports flight, registration, operator and type. Airport details also provides a direct shortcut.
- **Flight history** charts received altitude and ground speed. Click a chart or use the keyboard-accessible observation slider, then replay the selected fix on the globe. Missing speeds and gaps over two minutes stay disconnected. History is bounded and session-only; it is not a historical flight-data service.
- **Aircraft identity** in flight details explains registration, reported type, callsign-derived operator, source model/family/fallback and paint limitations, with provenance links.
- **Collections** adds personal favorite airports, airlines and aircraft alongside named airport collections. Each favorite category is capped at 50, saved in localStorage, and removable. Aircraft lookup runs only when requested; favorites do not start background tracking.
- **Model gallery** loads one aircraft at a time in its own interactive preview. Search sourced or approximate models, select an operator, drag/rotate, change distance, and orbit. Compatible full liveries take precedence over illustrative branding. Gear/wheel previews work only on rigged fallback models; sourced gear stays static. Reduced motion disables automatic animation. Closing or switching tabs disposes the preview.
- **Device & offline** retains successfully visited same-origin app, Cesium and map JSON assets with a service worker. The cache is limited to 100 assets / 40 MiB and excludes individual assets over 10 MiB. Live APIs, external satellite/terrain tiles, models and source archives are never cached by this feature. Offline Atlas coverage depends on previously loaded assets; no new traffic is claimed. Disable stops cache use/writes, and Disable & clear removes map assets after pending writes settle. One tiny settings entry persists the disabled choice across worker restarts. HTTPS or localhost is required.

Automatic graphics reduction samples browser animation-frame timing after a 15-second warmup, ignoring hidden tabs and long idle gaps. At least 60 measurements and 75% over 45 ms are required before stepping High→Balanced→Low. It never raises quality, modifies the saved preference, or intentionally schedules scene rendering. A notice offers restoration; the feature can be disabled. This heuristic responds to browser/device load, not a GPU benchmark.

No paid API, package, asset, account, billing or authentication was added. The existing server can serve the rebuilt frontend without a restart. Build advisories about Cesium's classic script and the main bundle size remain; exploration and model-gallery UI are lazy-loaded.

Validation for this update: 76 Node tests pass and the production build succeeds. Chromium/Playwright checked desktop (1440×1000) and mobile (390×844) discovery selection, identity disclosure, traffic-board filters/search, favorite persistence, history/replay, sourced and fallback gallery controls, and an actual offline reload. Cache exclusion, clear/disable, and disabled-state persistence were verified in the browser. No JavaScript errors occurred; offline API network failures are expected and shown explicitly. Firefox/WebKit and real-device GPU performance remain unverified. Browser-plugin tooling was unavailable, so the installed Playwright Chromium was used.


### Aircraft motion continuity fix

Selected aircraft now animate in the normal globe as well as Flight view. Low quality keeps motion at a lower rate; it no longer disables it. The foreground animation budgets remain 40 / 100 / 240 aircraft for Low / Balanced / High, and other visible aircraft receive interpolated positions once per second. Camera altitude no longer excludes all aircraft from animation in regional views. Reduced motion still shows received snapshots, and replay stays fixed to its chosen observations.

A separate bounded motion cache retains up to 32 fixes for 4,000 aircraft, independent of the 250-aircraft replay archive. Selecting an aircraft can seed its replay history from that cache. Fresh snapshots no longer overwrite an animated position between frames. Live rendering projects the latest accepted fix to the current time using the prediction behavior described below; displayed measurements retain their real timestamps. Motion status distinguishes estimated movement, stale estimates, missing motion data and reduced motion. Recorded history still keeps gaps over two minutes disconnected.

### Spotting, session recordings, geography and recovery

- **Aircraft details / Flight view → Why is this aircraft moving or waiting?** exposes fix age, estimated display behavior, retained fix count, median observation interval, current quality, camera-feed health and long gaps. It distinguishes estimates from missing motion data, stale observations and reduced motion.
- **Explore tools → Spotter** follows fresh, consistently approaching aircraft within 20 nm of the selected airport. It requires at least three fixes, excludes ground/non-aircraft targets and waits when no candidate qualifies. A 10-second grace period avoids rapid switching between feed polls. Next, reset and stop controls are explicit. Manual aircraft/airport navigation or dragging ends automatic following; open tools pause the queue. These are inferred approaches, not confirmed arrivals or clearances.
- **Record session / Explore tools → Sessions** starts and stops opt-in capture of camera-area, selected-airport and selected-aircraft observations. Memory limits are one hour, 1,000 aircraft and 100,000 fixes. Stop and save a JSON file before reloading or starting a replacement recording. Files include source/license metadata and the latest received identity for each track. Open/import validates the schema, unique identifiers, coordinates, time ordering and limits; files larger than 20 MiB are rejected. Nothing is uploaded.
- Session replay shows recorded aircraft together on a separate globe layer, with play/pause, 1×/10×/60× speed and a keyboard-accessible time slider. It never adds imported fixes to live observations, alerts, density or discovery. Aircraft do not appear before their first fix; intervals over two minutes are not interpolated, and a record disappears after its last fix becomes more than two minutes old. Live traffic continues collecting behind this view. Exit replay or select Live airspace to return.
- **Explore tools → Density** counts distinct airborne aircraft per 0.1° cell from retained motion fixes in the last 30 minutes, refreshed every 10 seconds. Repeated reports of the same aircraft do not inflate a cell. Up to 2,000 highest-count cells are shown, with no lines drawn across missing observations. The 4,000-aircraft / 32-fix-per-aircraft motion-cache limit still applies. This is a received-observation footprint, not complete global traffic or normalized aircraft-hours.
- **Flight view → Below the aircraft** uses the existing Natural Earth country polygons and cities. Distance sums retained observed path segments, excluding gaps over two minutes; it is not total flight distance. Local time is explicitly approximate: the nearest IANA timezone reference within the mapped country supplies an Intl timezone. Near timezone boundaries it may differ; water/unmapped areas show UTC. `scripts/prepare-timezones.py` packages the host's public-domain IANA `zone.tab`, recording its version and hash in `public/data/timezone-references.json`. No geocoding/timezone subscription or API is used.
- The globe render loop and interpolation pause behind Explore/About/Help and in hidden tabs; observation collection remains separate. Context-loss/render-error recovery rebuilds only the globe, preserving application state and unsaved recordings, with at most two automatic attempts before an explicit Restart globe control. Normal recovery preserves the camera pose. Online events immediately retry airport, selected-aircraft and camera feeds. The header distinguishes offline, reconnecting, interrupted and connected states without refreshing old timestamps.

No paid services, new packages, authentication or billing were introduced. Recorded-file positions and identity metadata are user-provided on import; parsing validates structure, not source authenticity. Timezone locations are reference points, not timezone boundary polygons. The existing server serves the rebuilt frontend without restarting.

Validation for these six additions: 84 automated tests and the production build pass. Chromium/Playwright at 1440×1000 and 390×844 verified spotter follow/switch, diagnostics, passenger country/time/distance, density, recording download/import, multi-aircraft playback and invalid-file rejection. An actual `WEBGL_lose_context` event rebuilt the viewer while retaining the saved in-memory recording; a render guard prevents the event-delivery race from producing invalid Cesium billboard bounds. Offline/online transitions triggered immediate feed retries. The final run had no JavaScript or console errors. Firefox/WebKit and physical-device GPU behavior remain unverified. Existing Cesium classic-script and bundle-size build advisories remain.

### Local replay and exploration tools

- **Explore tools → Sessions:** import or record a session, then Keep session in browser. The IndexedDB library supports rename, delete, export and replay. It is bounded to 20 sessions / 100 MB, with the existing 20 MB / 100,000-fix per-session limits. Browser data clearing can remove the library; exported files are the portable backup. No account or remote upload is involved.
- **Recorded aircraft inspection:** click a recorded airplane or choose it from the replay selector. Measurements follow the playback clock; the purple trail stops at that time and keeps gaps over two minutes disconnected. Track identity is the last identity stored for that aircraft. Replay selection never invokes live aircraft lookup.
- **Viewpoints:** save up to 20 local camera bookmarks including 2D/3D mode, position, zoom, orientation, basemap, terrain, structures, labels and grid. Restoring a bookmark ends automatic camera following.
- **Explore tools → Spotter:** choose Follow, Overhead or Fixed runway viewpoint; pause/resume the queue and camera, or switch candidates. The runway view is illustrative beside the first mapped runway, not a confirmed arrival runway. Dragging the globe stops spotter mode. Latest received observations are used when airport and camera feed timestamps differ.
- **Search /**: keyboard search across the airport directory, received aircraft (including airline names), local favorites and common app commands. Exact airport codes rank first. Unobserved saved aircraft use an explicit lookup when selected; no observation is reported honestly. Arrow keys / Enter select and Escape closes; typing in another field does not trigger the shortcut.
- **Performance:** two-second render-rate and enabled-entity/model counts, current quality and automatic reduction explanation; server-wide mean upstream response time is polled every ten seconds while the panel is open. Idle request-render mode naturally has low FPS. Counts are not GPU draw calls, and fetch/response timings are separate from aircraft position age.

All of these additions use the existing free data sources and local browser capabilities. No paid services or additional runtime dependencies were introduced.

### Route display and aircraft continuity fixes

The flight inspector and passenger view now include a route overview: origin/destination, a Natural Earth route map, retained observed track, geographic progress, direct remaining distance and session track distance. Explicit Route / Show full route actions display great-circle estimates and observed segments on the globe. Normal close-up flight views stay free of route lines. Callsign routes remain estimated/unverified; scheduled times, gates and arrival ETA are unavailable. No FlightAware API or paid data integration was added.

Viewpoints and Performance now open native dialogs; their triggers share a reserved row with Flight view. The passenger panel stays below that row on desktop and in the lower part of the map on mobile.

Aircraft model visibility uses the displayed, buffered aircraft position rather than the newer network fix. Close-up flight mode retains its model while that position moves. A marker remains visible until Cesium reports the model ready. Background aircraft keep animation ownership between lower-frequency updates; aircraft outside the foreground budget also update once per second. Live rendering now projects speed/heading during signal gaps, with explicit estimated-movement status. Recorded history remains observations only.

### Map tools, freshness, recovery and route/search controls

- **Map tools** consolidates 2D/3D, map layers, camera navigation, saved viewpoints and performance diagnostics. Click outside or press Escape to close it. Flight view remains a primary action beside the map.
- Aircraft labels distinguish moving, buffering, waiting and stale positions. **Map tools → Hide stale aircraft** excludes positions older than two minutes or with unknown/invalid times; the explicitly selected aircraft stays visible. Rendering never extrapolates beyond received fixes.
- If a 3D model errors or is not ready after 15 seconds, the renderer tries the existing lightweight model. If that also fails or times out, the aircraft marker remains. **Retry detailed model** in Flight view retries the original with a fresh request. No paid assets are fetched.
- **Show full route** opens Route mode, with a fit action including both airports, the selected aircraft, the retained trail and the geographic arc. Origin/destination buttons open directory airports or focus an endpoint outside the local directory. Nautical miles, kilometres and miles are available and remembered locally. Route estimates remain separate from confirmed schedules and flight plans.
- **Search /** combines text tokens with airline, aircraft-type and registration fields. Every supplied field must match. Ten recent successful searches are stored locally and can be cleared. Search covers received aircraft, saved favorites and the airport directory, not every aircraft worldwide.
- `npm run test:browser` builds and runs the repeatable, isolated browser regression suite. See `tests/browser/README.md` for Python Playwright prerequisites and the `SKYWARD_QA_PYTHON` override. Screenshots/logs stay outside the repository. `npm test` runs unit tests.

Position quality and personal tools
-----------------------------------

Received fixes now pass a conservative position-quality screen before camera traffic,
selected-flight motion, histories and recording. Invalid/future coordinates and times,
conflicting timestamps, out-of-order fixes, implausible jumps (over 1 nm plus 1,200 kt
for the interval), and altitude changes (over 1,000 ft plus 15,000 ft/min) retain the
previous accepted observation and its timestamp. These are heuristics, not proof that
a receiver or aircraft is wrong. A fix after more than two minutes can reacquire the
track; the gap is never interpolated. An amber quality label explains rejected fixes.

Observed trails use altitude bands: blue below 10,000 ft, mint below 25,000 ft, violet
at or above 25,000 ft. Estimated route legs remain dashed. In aircraft details, open
**Flight session summary & altitude profile** for observed duration, elapsed span,
distance, disconnected gaps, cumulative altitude changes and nearby directory airports.
The optional profile uses elapsed time and preserves gaps. Summaries describe retained
observations, not confirmed whole-flight totals or destinations.

**Focus mode** hides the sidebar and secondary panels. **Restore panels** or Escape
returns them. Map tools and flight controls remain available.

Open **Explore tools → Device & offline** for **Local backup & restore**. Export includes
favorites, watchlist, collections, viewpoints, map settings and route units. Import is
limited to 1 MB, validated and previewed before replacing the listed categories and
reloading. A failed write attempts rollback. Other site storage is untouched. Export
recordings separately from Sessions before restoring; restoration is disabled while
recording, and reload discards unsaved session observations.

Skyward includes a scoped app manifest, 192/512-pixel icons and a deferred install prompt.
Install from Device & offline when offered, or your browser's Install/Add to Home Screen
menu. HTTPS or localhost is required; browser/OS support varies. Installation does not
host the server or add offline traffic. An installed worker can show a self-contained
connection screen if navigation fails, even with optional map caching disabled. No
paid services, accounts or new dependencies are used.

Airport playback, camera and mobile controls
--------------------------------------------

In **Explore tools → Sessions**, open or record a session and choose **Replay area**
to use the currently selected airport. Choose 5/10/25/50 nm and all nearby traffic,
approaching candidates, departing candidates, or tracks containing ground fixes.
These settings also apply to saved-library replay. At least three contiguous fixes
with a consistent radial trend are needed for direction; flyovers remain possible.
No landing, takeoff or arrival schedule is confirmed. Radius clipping preserves gaps.
Use the replay timeline, speed and aircraft selector to inspect recorded traffic.

In Flight view, drag to release the camera and use **Resume flight camera** to ease
back into chase over 1.2 seconds. Reduced motion snaps directly. Heading changes use
the short angular turn and framing responds to panel resizing. The camera stays at
least 25 m above loaded terrain (sea level fallback); unavailable terrain remains an
accuracy limitation.

On mobile, the bottom toolbar contains Flights, Search, Explore tools and More.
More exposes the other existing actions. Drag the details-panel handle to resize,
or use its keyboard arrow controls. Clicking the handle cycles between sizes.

**Compare flight** in aircraft details opens a two-flight comparison. Select the
second flight or look it up. Cards show aircraft/operator identity, route evidence,
altitude, speed and freshness; the difference panel also reports observation-time
skew. Ground altitude is not subtracted from airborne altitude. Measurements are
not synchronized or extrapolated to a common instant.

Coverage messages distinguish offline, provider failure, first-load waiting, stale
positions, filters hiding received traffic, and a successful response with no rows.
None of these states proves that the actual airspace is empty.

Run `npm run test:soak` for the accelerated browser reliability check; see
`tests/browser/README.md` for its simulated-time scope, memory bounds and limitations.

### Sourced aircraft coverage and focus layout

`npm run import:max` imports the GPL-2.0 community MAX exterior from
[REXO-77/737-MAX](https://github.com/REXO-77/737-MAX) at the commit pinned in
`scripts/import-max-models.py`. Follow with `npm run prepare:branding` and
`npm run build`. The import retains the original AC3D/Blender source, textures,
license, author credits and SHA-256 provenance under `public/models/sourced`.
Textures share the model buffer across airline variants. No paid assets are used.

The MAX expansion brought the catalog to 40 authored models. B37M/B38M use the textured MAX-family
exterior with operator tail branding, including Ryanair. This is **not an exact
MAX 8 / Ryanair 8200 replica**: the upstream MAX 8 is unfinished, has a blank
fuselage texture and shares MAX 9 fuselage dimensions. We preserve the authored
MAX geometry and explicitly label the family match instead of stretching it.
MAX 10 is also marked variant-unverified. Airline paint is illustrative, not a
verified registration-specific livery. Gear is omitted in these static airborne
MAX exterior conversions. Original procedural models remain loading/error
fallbacks.

Additional neo, E-Jet, ATR and stretched widebody type codes now select an
explicitly labeled authored family model. Unknown/uncovered types still use
approximate fallbacks; this catalog does **not** cover every aircraft variant.
Inspect “Aircraft identity, model match & sources” for the selected model and
its limitations. Exact free MAX 8 geometry/livery and further type-specific
assets remain coverage gaps.

Focus mode aligns flight controls and the flight panel to the available map
space; on mobile it retains the resizable bottom sheet. Escape restores panels.


### Live estimated movement

Airborne globe markers and Flight view now project the latest accepted position
forward using reported ground speed and heading. A recent, contiguous two-fix
track can supply missing motion data. There is no waiting for a second fix or
45-second buffer when speed/heading are already available. Prediction continues
through outages while the aircraft remains retained in the view. Status labels
say **Estimated movement**, preserve fix age, and highlight growing uncertainty
after two minutes. It is an estimate, not a known current position. Recent turn and vertical-speed
trends fade to zero over 30 seconds; altitude changes are bounded and never
simulate touchdown. No route change or unreported maneuver is known.
New observations blend into the moving display over two seconds, using shortest
longitude and heading changes. Grounded targets, vehicles and reduced-motion mode
are not extrapolated; missing/invalid position, speed or heading can still prevent
prediction. User stale-aircraft filters continue to apply.

`liveMotion.ts` changes display entities only. Observations, trails, recordings,
alerts and replay keep their original data and timestamps; replay does not forecast.
The motion cache is bounded to 4,000 aircraft. Background rendering retains its
existing frame/visibility budgets. Prediction cannot restore aircraft absent from
the provider or ensure the real aircraft has continued along its old course.


### Prediction details, saved views and cabin audio

Flight view shows the rendered position and altitude beside the last confirmed
fix, its age, an age-based confidence label and an illustrative drift allowance.
The allowance is a heuristic, not a measured or calibrated accuracy bound.
A fresh fix after a gap shows a recovery banner while the view corrects. Recent
turn trends need three contiguous fixes with 5–60 second intervals; turn rate is
limited to 1.5 degrees/second and fades over 30 seconds. Reported vertical speed
must be within 6,000 ft/min; projected altitude changes are limited to 1,500 ft,
settle after 30 seconds, and do not extrapolate touchdown or low-altitude descent.

Camera view/distance, compact state, mobile panel height and focus mode persist
on this device under `skyward.flight-view.v1`, included in local backup. Temporary
free-camera and route modes do not overwrite the saved camera preset.
Explore tools → Model gallery → Model coverage ranks gaps by distinct aircraft
in retained observations. It distinguishes type matches, family matches and
procedural fallbacks; it does not claim worldwide traffic frequencies.

### Expanded general aviation, business and cargo models

The active catalog now contains **62 authored aircraft models**, up from 40, plus the existing procedural fallbacks. The 22 additions are Citation X, Falcon 50, Cessna 182, Cessna 208 Caravan, Pilatus PC-12/PC-21, Cirrus SR22, Robin DR400, Piper PA-18/PA-22/PA-32, Curtiss P-40, DHC-4 Caribou, MD-11, Boeing 707, ATR 72-500, CRJ200, ERJ 145, E175, Tu-134, EC135 and Gazelle. Private, cargo and passenger operations share type geometry where appropriate; these are community models, not verified aircraft registrations or cargo-door configurations.

`npm run import:flightairmap` imports 20 models from Ysurac/FlightAirMap-3dmodels at `0906d9ba1bdd906ce45807e45ed706c09912db19`. Per-model GPLv2/GPLv3 notices and editable Blender sources are retained. Models without clear per-model licensing were excluded. `npm run import:business` converts original AC3D exteriors from FGMEMBERS/CitationX at `e497ad98591fa8d441eba188517b7238d6b1f85d` and FGMEMBERS/Falcon-50 at `6f8fa21836bd6013601958327b6a1339e20da8c6`. It retains source UVs, textures, material colors and transparency, triangulates polygons, calculates crease normals, rigidly aligns axes and omits identified deployed landing gear. AC3D originals are the editable sources. The converter rejects unsupported transforms rather than silently distorting geometry. Geometry is not stretched.

Run `npm run prepare:branding` after imports and then `npm run build`. All 62 types have 24 illustrative operator-tail variants (1,488 total), sharing geometry buffers. Source manifests record pinned URLs and SHA-256 hashes. Each import preserves models/provenance from other collections. Only requested render assets load in the browser; editable source archives are not prefetched. Assets remain free of paid APIs/accounts.

AT76 maps to the ATR 72 family, E75S to E175, E35L to ERJ 145/Legacy family, and B77F to the 777-200 family. These remain labeled family matches. Unsupported types such as Gulfstream G650 still use an explicit fallback: a different private jet is not mislabeled as a Gulfstream. Rotors and propellers retain the authored static pose; this expansion does not claim a verified animation rig.

Expansion validation: 114 automated tests pass. Chromium rendered all 22 new neutral models and all 22 THY-branded variants, and checked desktop/mobile gallery selection. The gallery uses a local model coordinate frame. Imported FlightAirMap node transforms are baked into vertices/normals without changing the authored shape, avoiding Cesium’s rotated-node bounds bug; a regression verifies that complete fuselages contribute to the bounds. Live-flight checks cover Citation X, PC-12 and MD-11 model selection and continued movement. No new package or paid resource was added.


Cabin audio now uses original, locally synthesized ventilation noise and engine hum. Flight view exposes only “Cabin audio: On/Off”, defaults to On, and remembers an explicit Off choice. There is no YouTube player, video, duration selector, or external media request. Browser autoplay restrictions may defer sound until the next interaction. Audio pauses when hidden or the view is suspended and is disposed when flight view closes. This replaces the previous YouTube recording.


Flight view includes Front view (forward along the aircraft heading), Cabin (left/right window-side views), and Bird’s-eye (close overhead follow) in addition to existing external cameras. Front and cabin offsets scale with airframe length; these are approximate exterior viewpoints without modeled cockpit/cabin interiors. Front view sits ahead of the nose to avoid looking through an opaque exterior mesh. Terrain clearance is retained, so low-altitude views can be raised above their nominal offsets. The selected view persists and is supported by settings backups. Dragging releases the camera, and closing restores the original clipping distance.

Viewpoint validation: 116 automated tests pass and the production build succeeds. Chromium checks verify forward pilot heading, mirrored left/right window positions, close overhead framing, view persistence, mobile controls, restored clipping on close, and preserved pilot heading when terrain clearance raises the camera.

### Real-time day and night

The globe now uses Cesium's UTC solar ephemeris by default and migrates the old forced-daylight setting to natural lighting. Atlas and satellite imagery retain night shading at every camera altitude instead of Cesium's default near-ground lighting fade. Dynamic sunlight controls the atmosphere, with the standard Cesium sun, moon and star sky. The terminator refreshes while the map is idle and when the tab becomes visible again; no paid service or additional imagery provider is used.

Aircraft lighting follows each aircraft's location, including a smooth twilight transition and the extended solar horizon at altitude. A small ambient contribution keeps models readable at night. Pilot, Cabin, Bird’s-eye, external follow cameras, route, and airport cameras inherit the same scene lighting. Navigation labels remain readable. This is astronomical/presentation lighting, not observed weather, cabin lighting, or live city-light imagery. Replay geometry still uses current UTC illumination.

Validation: 119 automated tests pass, including equinox hemispheres, polar summer/winter and altitude-aware twilight. The build succeeds. Chromium compared fixed daytime/nighttime conditions across Pilot, Cabin, Bird’s-eye and chase views and the globe; checked forced-daylight preference migration and model illumination; no JavaScript errors occurred.


### Readable nights and aircraft navigation lights

Night-side surface detail is lifted while the sky and daylight hemisphere retain their normal exposure. A locally served NASA Black Marble **2016 historical composite** adds city-light geography above Atlas/satellite imagery; it is invisible on the daylight side. This 3600 × 1800 global texture is not current street-level lighting. It fades between camera heights of 2,000 km and 300 km, disappearing in close-up flight views so its coarse pixels do not obscure detailed terrain. Its attribution, original URL, byte count and SHA-256 are retained in `public/data/night-lights/source.json`.

Nearby aircraft have steady red port, green starboard and white rear navigation lights, double-flashing white wing strobes and a pulsing red beacon. These are illustrative patterns, not reported equipment states or verified type-specific flash sequences. Light anchors are measured from each authored/fallback mesh and follow the displayed aircraft orientation and estimated movement. Run `npm run prepare:aircraft-lights` after changing aircraft geometry to regenerate the anchor catalog. At most 12 nearby airframes have light effects, with the selected flight prioritized. Reduced motion keeps steady navigation lights and disables flashing; hidden tabs stop lighting updates.

Validation: production build and 122 automated tests pass. Browser checks cover night surface readability, historical overlay ordering, flashing on/off, moving light anchors, chase/cabin views and absence of renderer errors. Run `SKYWARD_QA_ARTIFACTS=/tmp/skyward-night-qa python tests/browser/night_lighting.py` with Playwright/Chromium installed after building. It starts its own isolated server and leaves the existing server alone.

Flight view now starts in Side whenever opened. Other camera buttons remain available during the session; saved distance and panel preferences are retained.


### Night-globe view and arrival-safe tracking

Map tools → **City lights globe** switches to 3D and frames the current night side using the solar ephemeris. The NASA 2016 city-light texture contributes emissive light after sunlight shading, so cities remain luminous in darkness. Daylight and close-up views suppress the glow; the low-resolution global image still fades before flight-view zooms. This is historical imagery, not live satellite video or individual street lights.

The selected aircraft is polled by hex every 10 seconds while visible, independent of camera-area traffic. Hex results share an 8-second server cache; other position queries retain their 20-second cache. Failures back off up to 60 seconds, with one in-flight selected request. Existing provider serialization and concurrency limits remain. Restart the Node server to apply the cache change.

Airborne display prediction continues through feed outages instead of freezing at the former 30-second approach / 120-second cruise cutoff. Those thresholds now indicate extended, lower-confidence motion. A mapped, plausible landing context drives descent and rollout; otherwise the last usable course and speed continue, without inventing a confirmed arrival. Fresh observations and ground reports take precedence. Estimated frames never enter source observations or recordings.

City-light registration uses camera-ray intersections with the fixed WGS84 ellipsoid, rather than reconstructing globe positions from the scene’s multi-frustum depth. The depth texture is read as a depth component. GPU coordinate probes were compared against independent Cesium globe intersections at nine screen positions across camera pans, rotations, zoom levels, and render scales; desktop/mobile rendering was also checked.


### Automatic predicted landing

When a selected aircraft loses updates for at least 15 seconds on a plausible final approach, a matching destination runway can drive its display through descent, flare, touchdown, decelerating rollout and, where connected mapped taxiways and parking positions are available, taxiing to an illustrative stand. Without a connected route, the animation stops before the runway end. The runway is chosen by proximity, approach alignment and heading; it is not a reported assignment. Go-arounds/climbs, overflights, aircraft beyond the runway, mismatched routes, missing elevation and unsuitable runways do not trigger it. Without a usable landing context, display-only course prediction continues. Tower traffic without route data may use a stricter inferred final: descending faster than 150 ft/min, below 3,000 ft above known field elevation, within 6 nm, heading within 15° and approach alignment within 12°. An explicit unrelated/unverified route is never overridden. Taxi animation follows connected mapped paths with rounded turns and decelerates at a mapped parking position. The selected stand is illustrative, never a confirmed gate assignment or observed arrival event.

Destination geometry loads independently of the airport being browsed, and renders alongside it. `data/airport-elevations.json` provides public-domain OurAirports field elevation for 1,146 catalog entries, with URL/date/source hash in `data/airport-elevations-source.json`; refresh with `npm run import:airport-elevations`. The animation uses a level runway and adjusts display clearance to rendered terrain; it is not surveyed ground geometry. Rigged fallback models extend gear and animate wheels; unrigged community models retain their authored gear geometry.

Flight view has one persistent **Predicted landing** phase label. Its main position/speed/altitude reflect the presentation during that phase. Last received fixes, ages, confidence and provenance remain under **Position & prediction details**, collapsed by default. Fresh position/ground reports override the animation; predictions never modify telemetry, trail points, recordings or alerts. Reduced motion and replay keep observation-based behavior.

Validation: 128 automated tests cover monotonic descent, continuity through touchdown, deceleration to a bounded stop, rejection of implausible landings, preservation of observations, and fresh go-around/ground recovery.

### Flight context and sharing

Flight session summary includes milestones derived only from retained observations; gaps never manufacture takeoff or landing events. Destination context shows calculated daylight, a timezone reference when available, and a rough direct-distance/current-speed arrival estimate only for a fresh plausible route heading toward the destination. This is not an airline ETA.

Share view captures the current 3D camera position and selected aircraft. Reopening uses current observations, not a recording or a following camera. Save map image exports the globe with source credits; imagery restrictions may require switching to Atlas. Favorites under Collections can add aircraft to the local watchlist and enable visible-page alerts. Device & offline offers a lighter-graphics preset.

Timezone references are an ICAO- and coordinate-matched subset of OpenFlights (ODbL-1.0), separate from the airport directory. Refresh with `python3 scripts/import-airport-timezones.py`; provenance and input SHA-256 are in `data/airport-timezones-source.json`. Browser IANA data supplies current offsets/DST. Missing or unsupported zones remain unavailable.

### Premium accounts, billing, journeys and flight alerts (test environment)

Start with `npm run start:premium-test` after `npm run build` (Node 24+).
Set `SKYWARD_PUBLIC_ORIGIN` to the exact browser origin, e.g.
`http://localhost:8000`. HTTPS is required for non-local origins, including forwarded
public URLs. Accounts are disabled on the normal server unless
`SKYWARD_ACCOUNTS=test`. This release deliberately rejects live payment keys.
Your existing free flight tracking stays available without an account.

Open **Upgrade** or **Account & journeys** in the footer (mobile: **More**).
Create a test account with email and a password of at least 12 characters. In a
selected flight's **Save journey & premium details**, choose the departure date
(UTC) and save it. Account journeys are persistent and private to each account.
**Find aircraft** looks up the current aircraft; a saved journey does not imply
that its original flight is still operating. Journey date and aircraft identity
are required before verified changes can become flight alerts.

To exercise hosted subscription checkout, configure server-only environment values:

- `STRIPE_SECRET_KEY`: your Stripe **test** secret key.
- `STRIPE_PRICE_ID`: an existing recurring test Price ID (you choose the price).
- Configure the test Customer Portal in Stripe for subscription management.
- `SKYWARD_ACCOUNT_DB`: optional database path (default `.local/accounts.sqlite`).

No secrets go into `VITE_` variables, browser storage, committed files or chat.
Checkout and Customer Portal use server-owned customer IDs. Premium verification
queries Stripe directly on each premium request: the matching price, active
subscription, unexpired item period and paid nonzero invoice must agree. A redirect,
client flag, demo fixture or trial does not grant access. No webhook endpoint is
needed for this request-time verification strategy. Provider outages fail closed;
there is no stale entitlement cache. Configure `SKYWARD_PUBLIC_ORIGIN` before using
checkout return URLs or posting any account mutations. Return links reopen the
account panel; **Refresh subscription** checks the current status.

**Test premium checks use a separate synthetic DEMO101 example only.** They do not
invoke AirLabs, even if an API key is present. Sample gates and times are never
merged into a real aircraft or its arrival prediction. Passenger names and actual
onboard counts remain unavailable. The public `/api/flight-details` preview stays
synthetic/disabled. The operator-only `npm run check:airlabs -- --live-once AAL6 AAB812`
can make one real API request with server-side `AIRLABS_API_KEY`; this is a separate
manual coverage check and does not use the membership quota ledger. Without arguments,
`npm run check:airlabs` is a no-network sample. Do not automate the operator tool.

### Usage and budget controls

SQLite transactions reserve allowance before premium checks. Limits persist across
restarts, are shared across processes using the same database, and apply globally
as well as to each account. Concurrent requests cannot overrun the allowance.
Failures after reservation conservatively retain their reservation. There is no
automatic premium polling. Rechecking one journey has a one-minute cooldown.

- `SKYWARD_MONTHLY_LOOKUPS`: per-account UTC calendar-month cap (default 100).
- `SKYWARD_GLOBAL_LOOKUPS`: global monthly cap (default 1000).
- `SKYWARD_BUDGET_MICROS`: global monthly reservation budget (default 1000000).
- `SKYWARD_REQUEST_MICROS`: conservative cost reservation per lookup (default 1000).

These defaults are **test accounting units, not AirLabs pricing or invoice claims**.
Actual flight-data spend is zero in this test flow. `npm run premium:usage` displays
aggregate test usage and budget reservations without disclosing account identities.
Use the same environment when inspecting limits. Every counter resets by UTC month,
not Stripe billing anniversary. A real spend cap requires confirmed provider unit
costs and must include base subscription fees and any other consumers of the key.

### Alert behavior and launch boundaries

Saved journeys have an alerts toggle and an in-app alert list. The verified-change
processor detects departures, arrivals, gate changes and delays of at least five
minutes. It rejects wrong identities, wrong departure dates, older checks and
synthetic data; repeated observations do not duplicate alerts. **Preview sample
alerts** is explicitly illustrative. No real alerts are generated until an authorized
live detail source is connected. There is no background monitoring, email or push
service in this release; existing observation-based watch alerts remain separate.

Before live customer launch: configure actual provider/account contracts and
coverage, email verification and account recovery, live payment credentials and
prices, and a reviewed live-only premium data path. Current test sessions cannot
access paid flight data. Accounts use salted scrypt hashes, revocable HTTP-only
sessions, HTTPS secure cookies, strict same-origin mutations, bounded request bodies
and persistent request throttling. Local SQLite files contain account information:
keep them private and back them up. No real subscription purchase was made by these
changes. Use the deterministic membership tests for payment/cancellation/failure
flows until your own Stripe test account is configured.

References: https://airlabs.co/docs/flight ; https://docs.stripe.com/billing/subscriptions/build-subscriptions ;
https://docs.stripe.com/api/subscriptions/list . Stripe API version: 2026-08-26.dahlia.

### Premium airport simulator

`/airport-simulation/` now requires the same server-verified Premium entitlement.
Anonymous visitors see a sign-in/upgrade page; free accounts cannot load the game.
Every simulator asset request (including JS, WASM and PCK, GET and HEAD) checks
entitlement before reading or serving files. Game responses are private/no-store;
there is no shared browser cache authorization shortcut. A verification outage
returns an unavailable page or denies the asset request. Existing downloaded game
code cannot be remotely revoked; cancellation blocks subsequent requests.

The authorized page embeds the game below a persistent **Back to Skyward** bar,
with a separate **Your account** link. In game fullscreen, exit fullscreen first
to return to that bar. The footer and Premium comparison advertise simulator
inclusion. Test checkout remains test-only; configuring a test subscription does
not charge a real payment. Restart the Node server after this route change.

### Arrival rotation and sky objects

A fresh homepage visit gently rotates the camera around Earth. Clicking, dragging,
touching, scrolling, keyboard camera input, or using a control ends the arrival
animation. Explicit shared views, aircraft navigation, replay, restored camera
poses and reduced-motion mode do not start it. Hidden tabs and modal dialogs pause
render work. This camera motion does not rotate the map imagery relative to Earth.

In the 3D globe, **Map tools → Sun, Moon & planets** locates the Sun, Moon, Mercury,
Venus, Mars, Jupiter, Saturn, Uranus and Neptune. Hover their globe-scene markers
for names, or use the finder buttons on touch devices. **Back to Earth** restores
the prior camera. Sky markers are illustrative, with enlarged discs and compressed
distances, not a scale solar-system simulation. The Moon now shows its calculated
Earth-view illuminated fraction and waxing/waning phase; surface orientation is
illustrative. Optional sky labels persist locally. Escape returns from a sky
object after any open menu has closed.
Directions are calculated locally using astronomy-engine 2.1.19 (MIT), refreshed
once a minute; no paid API is used. The celestial bundle is loaded separately.
Its license is included at `/watch/data/astronomy-engine-LICENSE.txt`.


### First visit, camera controls, and airport timeline

The dismissible three-step introduction appears on a fresh homepage visit and can
be replayed from **Map tools → Getting started**. Dismissal stays in local storage;
shared links are not interrupted. **Reset view** exits flight/replay/spotter views
and restores a north-up 3D globe. Touch pinch zoom no longer also tilts the camera;
use the tilt button for that. Inertia and maximum input movement are reduced.

Flight view, account forms and help load in separate chunks when requested.
Background aircraft model downloads wait until camera motion settles for 350 ms;
existing nearby models and selected aircraft retain priority. No model archives
are prefetched. This reduces startup work but is not a measured network-speed SLA.

Airport details include **Observed activity timeline**, a bounded session view of
the last 30 minutes. An event needs two consistent observed fixes on each side of
a ground/airborne transition, no gap over two minutes or impossible position jump,
ground fixes within 3 nm and airborne fixes within 8 nm. It displays the timestamp
interval, not an invented touchdown time. These are likely local arrivals/departures,
not airport-confirmed movements; nearby airports can share coverage. Events rely on
retained session histories (up to 250 aircraft) and can disappear when histories are
evicted. Receiver gaps and missing ground fixes result in no event. Predicted
positions never populate the timeline. The existing inferred activity view remains
separate. This adds no paid requests, schedules or airport operational data.

Map attribution uses Cesium's external credit container in the adjacent app footer.
No credit text or attribution button overlays the globe. Active-provider credits
remain visible in normal, mobile and focus layouts; supplementary source details
remain available through the native keyboard-accessible Map credits dialog.

### Viewport traffic and rate limits

The camera publishes its area after movement settles (about 400 ms). Continuous
arrival rotation and manual panning do not enqueue changing area requests; a
following camera can still publish its moving area. The first settled viewport
request starts after a 400 ms debounce. Subsequent refreshes remain 35 seconds.
Recent real observations already received in this session can bridge pending or
failed viewport requests, limited to the requested area and two-minute-old fixes;
original timestamps and selected-flight freshness disclosures are preserved.
Successful empty snapshots still clear the viewport normally.

The backend reuses unexpired larger area snapshots for contained viewport queries,
filtering to the smaller radius without modifying observation or fetch timestamps.
An upstream 429 establishes a shared per-origin cooldown (at least 60 seconds,
or longer when Retry-After requests it). Queued work also checks the cooldown
before contacting the provider. The HTTP response forwards Retry-After so camera
requests pause too. No paid API fallback or fabricated traffic is used. Free-feed
coverage and upstream availability still determine how many aircraft can appear.
Backend changes require restarting the locally managed Node server.
Aircraft remain recognizable billboard icons out to 600 km camera distance in low
and balanced graphics (1,000 km in high); graphics reductions no longer turn them
into tiny dots at ordinary regional zoom. Labels still wait for closer zoom to
avoid clutter, and 3D model budgets are unchanged.

### Airport motion and map reliability

Ground fixes blend over two to eight seconds, depending on correction distance. Moving ground traffic gets up to eight seconds of bounded, decelerating extrapolation; high-speed ground prediction requires a matching mapped runway. Stationary observations remain parked. Low-altitude climbs and takeoff/landing demonstrations use continuous motion through liftoff and touchdown. Fresh observations replace prediction; animation never becomes recorded telemetry.

Nearby airport and camera requests share padded half-degree regional buckets (25 nautical miles of padding), pending containing requests and fresh cached results. Each response is filtered back to its requested circle. Provider rate-limit cooldowns apply across views, retaining original observation times. Restart the Node server to apply backend changes.

The existing traffic status distinguishes loading, empty coverage and failures, with a visible filter-reset button. Callsign labels avoid collisions and controls while aircraft icons remain visible. Explore tools → Device & offline offers optional last-view resume (up to seven days; shared links take precedence) and battery saver (20 fps during motion, 5 fps when idle, reduced pixel density and steady aircraft lights). Hidden tabs pause rendering and polling.

Explore tools → Connection health contains the Reliability dashboard: initial globe setup, session feed request/failure counts, response timings and script/render errors. Diagnostics stay in the browser; no external analytics are sent.

### Airport activity, turnarounds and flight moments

- **Explore tools → Spotter** now offers arrival candidates, departure candidates and recently reported ground traffic. Automatic 20-second aircraft switching is optional; manual selection/dragging stops following and open dialogs pause it. Arrival/departure categories are inferred trends, not confirmed itinerary events.
- **Explore tools → Airport → Start ground animation** runs three illustrative turnarounds over a connected mapped taxi/parking route. A shared route and stand stay reserved through departure, so queued simulations cannot meet an outgoing aircraft head-on or occupy its gate. Recent reported traffic gets priority: a simulation holds for 65 m separation or an occupied mapped runway. Coverage gaps cannot prove a runway clear. No connected route means no animation; IAD has usable routes.
- The optional ground scene includes an illustrative jet bridge, baggage cart, pushback tug and departure, with pause, speed, restart, stand and aircraft views. Its original lightweight aircraft supports gear, rolling/steering wheels and hinged flaps. Community aircraft without verified rigs retain their source geometry; gear animation is not claimed for them. Regenerate the optional rig with `node scripts/prepare-ground-rig.mjs`. Simulations never enter live observations, alerts, recordings or flight status.
- New fixes blend over 2–8 seconds depending on correction distance, preserving the current presentation across globe/flight-camera handoffs. This reduces abrupt repositioning; it cannot establish actual unobserved movement.
- Empty camera areas offer up to three nearby areas represented by recently received aircraft, within 500 nm. Suggestions use existing observations, expire after two minutes and issue no speculative polling.
- Nearby 3D model allocation now excludes offscreen aircraft, uses a small retention band to reduce loading churn, and retains quality-based budgets. Distant aircraft remain icons; leaving the view releases their model graphics.
- **Select a flight → Explore tools → Sessions → Save a flight moment** captures the last 1, 2 or 5 minutes of received fixes and the current camera. At least two fixes are required. Download the JSON to share; recipients open it through **Open a saved session**. Replay restores the camera, preserves missing-data boundaries and never imports predictions into live traffic. This is local replay data, not a video or a hosted public link.

### Tower activity viewing

Open an airport’s **Tower view** for a fixed viewpoint 65 m above rendered terrain. Auto-aim turns toward a chosen recent aircraft or the nearest one within 10 nm; binocular zoom changes the lens, not the tower position. Dragging pauses auto-aim. Closing the tower restores normal globe controls. Ground observations are placed on rendered terrain rather than treating reported field altitude as height above the apron.

**Watch landing, taxi & takeoff** starts a labeled synthetic sequence through approach, touchdown, rollout, taxi, stand services, pushback and departure on the chosen runway’s connected mapped route. **Watch landing / taxi / takeoff** jumps to each demonstration phase; pause and playback speed remain available. The camera stays at the same tower throughout. Unsupported/disconnected runway-to-stand geometry is reported instead of inventing a path. Switching back to **Observed traffic** removes the simulation. Actual receiver coverage may not show every airport movement, and neither the viewpoint nor simulated gate/runway assignments claim operational accuracy.

### Front and pilot cockpit views

The former **Pilot** camera is now **Front view**: the same unobstructed forward position. Old saved pilot preferences migrate to front view, and backups support both new modes. **Flight view → Pilot cockpit** opens a generic illustrated glass cockpit with a forward windshield, ground-speed/altitude/vertical-speed readouts, a track compass and an interactive yoke/throttle console. The cockpit loads on demand and adapts to desktop/mobile screens. It is not a verified Boeing/Airbus or other type-specific interior.

**Following observed flight** keeps received readouts separate from the projected camera position. Ground speed is labeled GS, not airspeed; attitude is explicitly illustrative because pitch/bank, indicated airspeed, fuel and engine data are unavailable. **Try practice controls** starts an isolated local camera simulation. Drag/focus the yoke and use arrow keys or WASD (pull/down climbs, push/up descends); Q/E controls rudder. Throttle, gear/flap drag, level hold, pause and reset affect only the practice view. Practice never updates aircraft entities, observations, histories, routes, recordings or server data. Hidden tabs pause practice and release inputs. Return to live follow, Front view, Side view or Exit cockpit restores observation-based viewing. This simplified response model is not flight-training software.


### Tower motion and aircraft rendering

Tower aircraft and demonstrations update on Cesium's frame clock; auto-aim runs before rendering with time-based smoothing. Demonstrations start at 1×, with 5×/20× available. Pause, background-tab suspension and reduced-motion preferences still apply. Low/balanced tower quality allows three nearby detailed aircraft; high allows eight, with approach visibility up to 20 km and distant marker fallback. Known types use existing sourced models/liveries. Explicitly watched tower targets remain tracked during a feed gap. Displayed landings and taxi-to-stand remain predictions, not confirmed operations.

### Tower radar

Tower view includes a north-up flight-data scope with mapped runway outlines, range rings (2/5/10/25 nm), direction vectors, observed trail dots, callsigns and received altitude/ground-speed readouts. Select a target with the mouse or Enter/Space to aim the tower camera without leaving tower view. Ground and label filters affect the scope only. The scope follows displayed globe positions, including predicted motion; selecting a track reveals fix age. Older tracks use muted colors. Demonstration aircraft are excluded. This is a visualization of the existing flight feed, not a connection to operational ATC radar, and it adds no API calls. Mobile starts minimized and temporarily hides the tower controls while the scope is expanded. The scope stops updating when minimized, obscured or the tab is hidden.

The pilot cockpit also embeds the traffic scope in its navigation display. It is centred on the displayed aircraft (or local practice position), keeps north up, and rotates the ownship symbol with the displayed track. Ownship is excluded from traffic targets. Selecting traffic opens its readout without changing the piloted flight or camera. Radar/compass and mobile radar/instrument controls share the dashboard space; range, label and ground filters remain available. Existing received traffic supplies the scope, with no additional polling or API cost. This is a traffic visualization, not TCAS or a collision-avoidance instrument.

If no connected runway-to-stand taxi route is mapped, tower and ground-animation panels still offer independent landing/rollout and takeoff demonstrations on a usable mapped runway. Taxi is disabled with a capability explanation; stand/service controls are omitted. Each runway-only demonstration ends after 45 simulation seconds and can be replayed. Landing ends on the runway; completed takeoff removes the demonstration aircraft rather than leaving it frozen aloft. Airports without usable runway geometry show a runway-specific unavailable message. Connected airports retain the full landing/taxi/turnaround/takeoff sequence.

### Tower, cockpit and airport viewing improvements

- Tower camera controls provide Wide (1×), Approach (2×) and Runway (4×) binocular presets and optional clearer aircraft lighting. This raises aircraft illumination only; the globe retains the actual day/night cycle. Next arrival/departure/ground controls and the activity queue use recent received movement candidates, not a confirmed schedule or clearance.
- Cockpit traffic can switch between north-up and track-up, show relative or absolute received altitude, and expand into a larger scope. Escape compacts the expanded radar without leaving the cockpit. Missing altitude remains unknown. Relative values are based on ownship's received altitude (local displayed altitude during practice).
- Predicted finals use finer arc-length sampling, eased flare pitch and nose lowering after touchdown. Fresh climbing observations override a predicted landing and blend to the new moving track within two seconds. Other corrections retain the existing distance-dependent smoothing. No prediction enters observation or recording stores.
- Mapped airport detail adds decorative runway-edge/threshold lights at night, yellow taxiway/stand markings and terminal roof outlines. Light placement is illustrative, not a surveyed lighting system or its live operational state. Geometry is capped by quality, and missing terminal/taxi geometry is not fabricated.
- Performance now reports browser-frame p95, the percentage over 50 ms, pending/slow model loads and the last completed model-load duration. Automatic detail reduces nearby background models during sustained frame pressure, keeps the selected/watched aircraft model, and uses a 15-second recovery hold to avoid repeated loading/unloading. Existing overall automatic-quality reduction still applies. Browser scheduling measurements are not GPU timings.

All features use existing local geometry/assets and existing received flight data; they add no paid service or new flight-data polling.

### Spatial audio, director and diagnostic snapshots

- **Tower audio** is off until clicked. It synthesizes engine hum and noise locally
  for up to three nearby displayed aircraft. Stereo direction follows the camera;
  distance controls attenuation. Volume is adjustable. Hidden/paused views suspend
  audio, and leaving the tower closes the audio context. This is illustrative
  sound, not an aircraft recording or radio feed.
- **Auto-director** prefers recent arrival candidates, then departures. It retains
  a predicted approach through rollout before switching. Otherwise it changes
  subjects after three minutes. Manual track selection or dragging disables it;
  completed subjects are remembered in a bounded queue until the director resets.
- Cockpit radar offers **All / ±1,000 / ±2,000 / ±5,000 ft** altitude bands and
  selected-target distance/relative bearing. Unknown traffic altitude is excluded
  while filtering; unknown ownship altitude disables altitude filtering.
- Aircraft bank smoothly with displayed turns. Gear/flap transitions run only
  on models with the supported local rig; imported meshes without matching nodes
  are not assigned fabricated rig controls. The configuration is illustrative.
- **Map tools → Performance → Download problem snapshot** saves camera, rendering,
  entity counts and up to 30 feed timing changes locally. It uploads nothing and
  includes no cookies, credentials, storage contents or passenger information.
- `npm run test:views` checks repeated view/audio lifecycle behavior for five
  wall-clock minutes; `npm run test:soak` separately exercises six accelerated
  hours of feed/reconnect updates. See `tests/browser/README.md` for limits.

### Discovery, saved flights and sharing

- **Watch something interesting** uses recent aircraft already received near the
  camera. Supported approach/departure trends get priority; otherwise it chooses
  a nearby airborne aircraft. It opens a side or bird camera immediately and
  avoids choosing the same aircraft twice when another candidate is available.
  Without a suitable airborne track, it prefers a nearby airport with received
  activity and opens its tower, or uses the current airport while waiting
  for coverage. This does not scan the world or add background provider polling.
- **My flights** combines watched aircraft, local favorites, a resume button and
  received-track replay. Identity/favorites remain on this device; resumed
  aircraft may now be flying a different service. Missing observations stay
  unavailable. Replay only uses positions actually received in this session.
- Local watch alerts now include reported airborne-to-ground transitions and
  inferred destination approaches when matching route information was already
  loaded. Optional browser notifications require a click and browser permission.
  The page must remain visible; this is not an email or background push service.
- Airport timelines include recent ground observations separately from supported
  arrival/departure transitions. Gate occupancy and airport-confirmed events are
  never invented from these observations.
- Recorded sessions can restart, scrub time, and follow a selected recorded
  aircraft from side or bird cameras. Dragging releases the replay camera.
- Sharing from Flight view captures the selected flight and viewpoint as well as
  the map camera. Opening that link follows the latest available position, not a
  historical moment. Map image export retains source attribution.
- Upgrade includes an explicitly illustrative premium example. Previewing it
  cannot create a checkout, consume a premium lookup, or grant simulator access.
  Accounts/payments remain test-only and live passenger information is unavailable.

Launch checks include the unit suite's premium access enforcement, quota/budget
limits, simulator protection, and a server restart on the same local port. Browser
QA uses fixture traffic on an isolated random port, leaving port 8000 untouched.

Run `npm run test:customer` for the customer flows, or `npm run test:launch`
for unit/server plus core and customer browser checks. Set `SKYWARD_QA_PYTHON`
to your Playwright-enabled Python interpreter when needed.

Pilot cockpit includes original synthesized engine and airflow audio, enabled by
default, with a dedicated on/off switch and volume slider. Preferences stay on
this device. Practice throttle changes the sound; live-follow ambience uses a
rough speed-based mix, not reported engine settings. Cabin audio is unmounted
while cockpit audio is active so the two do not overlap. Cockpit sound suspends
in background tabs, obscured views and paused practice, and closes on cockpit
exit. Browsers that block autoplay show an explicit enable control. No external
recording, radio feed, media request or paid API is used for this audio.

Tail-logo placement favors the upper fin, with clearance above the lower 30% of
its usable surface and silhouette coverage checked on both faces. Decals use a
small surface offset and alpha masking to avoid transparent-layer sorting and
surface flicker. All sourced branding variants and illustrative fallback logos
are regenerated locally; supplied full-aircraft livery textures remain intact.
Model and shared-buffer URLs carry a tail revision so cached assets refresh.
