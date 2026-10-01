# Special-aircraft visual coverage

Reviewed catalog mapping for 120 current featured aircraft. 64 have exact-type community geometry, 23 use an explicitly related family model, and 33 require an approximate fallback or more precise type identification. A model match does not certify every geometric detail.

The registration index fills missing feed types at ingestion/selection, preserves provider types and timestamps, and rejects conflicting types for registration-based paint selection. It does not infer aircraft appearance from team membership. Existing compatible operator textures can be selected by registration when the callsign does not identify an operator.

Imported two additional community operator textures (LATAM/TAM and Volaris) from the pinned GPL-2.0 [FlightGear A320-family source](https://github.com/FGMEMBERS/A320-family/tree/00038142d3443d7f4aec9410520df608e8ae7ba8). Assets retain credits, source XML where available, license and hashes. These are historical/operator textures, **not exact promotional designs**. The 36 available full-aircraft operator textures load on demand. This change adds about 0.9 MB of texture assets and no API calls, database writes or external runtime texture requests.

No exact registration-specific promotional texture has yet been verified/imported for these 120 aircraft. Exact UFC, Patriots, Jets, Pokémon, Sanrio and similar paint remains outstanding. The linked source is a reference, not a license to redistribute photography or a texture. Flight view exposes an appearance-reference link in model details.

Regenerate with `node web/scripts/prepare-special-visuals.mjs` (also part of build). Source catalog changes must be reviewed before publication. An absent model is not silently counted as an exact match.

| Registration | Aircraft | Visual match | Appearance reference |
|---|---|---|---|
| N42RF | Lockheed WP-3D Orion | fallback | [Source](https://www.omao.noaa.gov/aircraft-operations/aircraft/lockheed-wp-3d-orion) |
| N43RF | Lockheed WP-3D Orion | fallback | [Source](https://www.omao.noaa.gov/aircraft-operations/aircraft/lockheed-wp-3d-orion) |
| N49RF | Gulfstream IV-SP | fallback | [Source](https://www.omao.noaa.gov/aircraft-operations/aircraft/gulfstream-iv-sp) |
| N36NE | Boeing 767-323 | type | [Source](https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=36NE) |
| N225NE | Boeing 767-323 | type | [Source](https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=225NE) |
| N933AK | Boeing 737-9 MAX | family | [Source](https://news.alaskaair.com/community/alaska-airlines-seattle-kraken-aircraft-2024/) |
| N330AU | McDonnell Douglas MD-10-30F | fallback | [Source](https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=330AU) |
| OE-LDM | Douglas DC-6B | fallback | [Source](https://www.flyingbulls.at/en/fleet/douglas-dc-6b) |
| N25Y | Lockheed P-38 Lightning | fallback | [Source](https://www.flyingbulls.at/en/stories/unique-beauty) |
| N46RF | De Havilland Canada DHC-6-300 Twin Otter | fallback | [Source](https://www.omao.noaa.gov/aircraft-operations/aircraft/de-havilland-dhc-6-300-twin-otter) |
| N48RF | De Havilland Canada DHC-6-300 Twin Otter | fallback | [Source](https://www.omao.noaa.gov/aircraft-operations/aircraft/de-havilland-dhc-6-300-twin-otter) |
| N56RF | De Havilland Canada DHC-6-300 Twin Otter | fallback | [Source](https://www.omao.noaa.gov/aircraft-operations/aircraft/de-havilland-dhc-6-300-twin-otter) |
| N57RF | De Havilland Canada DHC-6-300 Twin Otter | fallback | [Source](https://www.omao.noaa.gov/aircraft-operations/aircraft/de-havilland-dhc-6-300-twin-otter) |
| N985AK | Boeing 737-9 MAX | family | [Source](https://news.alaskaair.com/company/seattle-fifa-world-cup-2026-local-organizing-committee-livery/) |
| N746JB | Airbus A320-232 | type | [Source](https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=746JB) |
| N595JB | Airbus A320-232 | type | [Source](https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=595JB) |
| N632JB | Airbus A320-232 | type | [Source](https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=632JB) |
| N633JB | Airbus A320-232 | type | [Source](https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=633JB) |
| N605JB | Airbus A320-232 | type | [Source](https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=605JB) |
| OE-XTV | Airbus Helicopters AS350 B3+ | fallback | [Source](https://www.flyingbulls.at/en/fleet/as-350-b3-ecureuil) |
| OE-CKW | Aviat Husky | fallback | [Source](https://www.flyingbulls.at/en/fleet/aviat-husky) |
| OE-ADM | Beechcraft T-34 Mentor | fallback | [Source](https://www.flyingbulls.at/en/fleet/beech-t-34-mentor) |
| OE-XDM | Bell 47 G-3B-1 Soloy | fallback | [Source](https://www.flyingbulls.at/en/fleet/bell-47-g-3b-1-soloy) |
| N11FX | Bell AH-1F Cobra | fallback | [Source](https://www.flyingbulls.at/en/fleet/bell-cobra-209/ah-1f) |
| D-HSDM | MBB BO105 C | fallback | [Source](https://www.flyingbulls.at/en/fleet/bo105-c) |
| D-HTDM | MBB BO105 C | fallback | [Source](https://www.flyingbulls.at/en/fleet/bo105-c) |
| D-HUDM | MBB BO105 S | fallback | [Source](https://www.flyingbulls.at/en/fleet/bo105-s-media-helikopter) |
| OE-XSY | Bristol 171 Sycamore | fallback | [Source](https://www.flyingbulls.at/en/fleet/bristol-171-sycamore) |
| N80FS | Canadair Sabre Mk6 | fallback | [Source](https://www.flyingbulls.at/en/fleet/canadair-f86-sabre-mk6) |
| OE-EDM | Cessna 208 Amphibian Caravan | type | [Source](https://www.flyingbulls.at/en/fleet/cessna-208-amphibian-caravan) |
| N991DM | Cessna 337 Skymaster | fallback | [Source](https://www.flyingbulls.at/en/fleet/cessna-337-skymaster-push-pull) |
| OE-EAS | Vought F4U-4 Corsair | fallback | [Source](https://www.flyingbulls.at/en/fleet/chance-vought-f4u-4-corsair) |
| OE-XFB | Eurocopter EC135 | type | [Source](https://www.flyingbulls.at/en/fleet/eurocopter-ec135) |
| OE-ARN | Extra 330LX | fallback | [Source](https://www.flyingbulls.at/en/fleet/extra-300-lx) |
| OE-ARO | Extra 330LX | fallback | [Source](https://www.flyingbulls.at/en/fleet/extra-300-lx) |
| N50429 | Fairchild PT-19 | fallback | [Source](https://www.flyingbulls.at/en/fleet/fairchild-pt-19) |
| N68RW | Grumman F8F-2 Bearcat | fallback | [Source](https://www.flyingbulls.at/en/fleet/grumman-f8f-2-bearcat) |
| N6123C | North American B-25J Mitchell | fallback | [Source](https://www.flyingbulls.at/en/fleet/north-american-b-25j-mitchell) |
| OE-EFB | North American P-51D Mustang | fallback | [Source](https://www.flyingbulls.at/en/fleet/north-american-p51-d-mustang) |
| OE-EMM | North American T-28B | fallback | [Source](https://www.flyingbulls.at/en/fleet/north-american-t-28b) |
| OE-FSE | Vulcanair P.68TC Observer | fallback | [Source](https://www.flyingbulls.at/en/fleet/p68tc-observer) |
| OE-EMD | Pilatus PC-6 Porter | fallback | [Source](https://www.flyingbulls.at/en/fleet/pilatus-porter-pc-6) |
| OE-AMM | Boeing PT-17 Stearman | fallback | [Source](https://www.flyingbulls.at/en/fleet/pt-17-stearman) |
| OE-ERB | North American T-6 | fallback | [Source](https://www.flyingbulls.at/en/fleet/t-6) |
| C-GNLW | Boeing 737-200 | family | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| N736KA | Boeing 737-700 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| N662QX | Embraer E175 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| N661QX | Embraer E175 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| N328NV | Airbus A319 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| N302NV | Airbus A319 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| A6-EJB | Airbus A320neo | family | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| A6-BLV | Boeing 787-9 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| A6-EUH | Airbus A380 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| A6-EOD | Airbus A380 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| B-6520 | Airbus A330-300 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| 9M-MTL | Airbus A330-300 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| 9M-XXD | Airbus A330-300 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| 9H-CXG | Boeing 737-800 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| TC-SOI | Boeing 737 MAX 8 | family | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| TC-JNB | Airbus A330-200 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| EC-LVU | Airbus A320 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| EC-LUO | Airbus A320 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| CN-MAX | Boeing 737 MAX 8 | family | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-sports-liveries/) |
| CC-BED | Airbus A321 | type | [Source](https://www.aerotime.aero/articles/let-the-games-begin-seven-airlines-sporting-2024-paris-summer-olympic-liveries) |
| LV-FVH | Airbus A330-200 | type | [Source](https://www.planespotters.net/photo/1932052/lv-fvh-aerolineas-argentinas-airbus-a330-202) |
| N809SY | Boeing 737-800 | type | [Source](https://hnlrarebirds.blogspot.com/2026/04/sun-country-airlines-n809sy.html?m=0) |
| N710AL | Boeing 737 MAX 9 | family | [Source](https://www.alaskaair.com/content/travel-info/our-aircraft/737-9-max-mariners) |
| A6-BND | Boeing 787-9 | type | [Source](https://www.mediaoffice.abudhabi/en/transport/etihad-airways-fly-european-champions-manchester-city-on-club-themed-dreamliner-to-manchester/) |
| D-AEWM | Airbus A320 | type | [Source](https://www.planespotters.net/airframe/airbus-a320-200-d-aewm-eurowings/34ww81) |
| A7-BEK | Boeing 777-300ER | family | [Source](https://www.airhistory.net/photo/874411/A7-BEK) |
| A7-BEG | Boeing 777-300ER | family | [Source](https://www.jetphotos.com/photo/12004096) |
| A7-BEL | Boeing 777-300ER | family | [Source](https://www.karlcacchioli.com/work/f1-aircraft-livery) |
| N531DN | Airbus A350-900 | type | [Source](https://www.scramble.nl/civil-news/delta-to-introduce-3rd-team-usa-aircraft) |
| N521DN | Airbus A350-900 | type | [Source](https://www.scramble.nl/civil-news/delta-to-introduce-3rd-team-usa-aircraft) |
| N522DZ | Airbus A350-900 | type | [Source](https://www.scramble.nl/civil-news/delta-to-introduce-3rd-team-usa-aircraft) |
| N411DX | Airbus A330-900 | family | [Source](https://www.airhistory.net/photo/486237/N411DX) |
| JA607A | Boeing 767-300ER | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/just-for-fun/pokemon-liveries/) |
| JA894A | Boeing 787-9 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/just-for-fun/pokemon-liveries/) |
| JA784A | Boeing 777-300ER | family | [Source](https://www.flightradar24.com/blog/flight-tracking-news/just-for-fun/pokemon-liveries/) |
| B-18916 | Airbus A350-900 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/just-for-fun/pokemon-liveries/) |
| B-18101 | Airbus A321neo | family | [Source](https://www.flightradar24.com/blog/flight-tracking-news/just-for-fun/pokemon-liveries/) |
| PK-GMU | Boeing 737-800 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/just-for-fun/pokemon-liveries/) |
| 9V-OJJ | Boeing 787-9 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/just-for-fun/pokemon-liveries/) |
| JA73AB | Boeing 737-800 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/just-for-fun/pokemon-liveries/) |
| JA73NG | Boeing 737-800 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/just-for-fun/pokemon-liveries/) |
| HL8306 | Boeing 737-800 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/just-for-fun/pokemon-liveries/) |
| B-16740 | Boeing 777-300ER | family | [Source](https://www.evaair.com/zh-hk/fly-prepare/our-fleets/eva-special-livery-jets/) |
| B-16217 | Airbus A321 | type | [Source](https://www.evaair.com/zh-hk/fly-prepare/our-fleets/eva-special-livery-jets/) |
| B-16722 | Boeing 777-300ER | family | [Source](https://www.evaair.com/zh-hk/fly-prepare/our-fleets/eva-special-livery-jets/) |
| B-16332 | Airbus A330-300 | type | [Source](https://www.evaair.com/zh-hk/fly-prepare/our-fleets/eva-special-livery-jets/) |
| B-16333 | Airbus A330-300 | type | [Source](https://www.evaair.com/zh-hk/fly-prepare/our-fleets/eva-special-livery-jets/) |
| CC-BGM | Boeing 787-9 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| PR-MYA | Airbus A320 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| N542VL | Airbus A321neo | family | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| N207NV | Airbus A320 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| PK-GPY | Airbus A330-300 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| B-18055 | Boeing 777-300ER | family | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| A6-BMA | Boeing 787-10 | family | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| JA743A | Boeing 777-200ER | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| B-8119 | Airbus A320 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| B-5976 | Airbus A330-300 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| B-6635 | Airbus A320 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| B-6507 | Airbus A330-300 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| B-9957 | Airbus A321 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| 9M-AFF | Airbus A320 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| 9M-XXU | Airbus A330-300 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| TC-SPY | Boeing 737-800 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| TC-SPO | Boeing 737-800 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| OO-SNB | Airbus A320 | type | [Source](https://www.flightradar24.com/blog/flight-tracking-news/special-aircraft-tracking/tracking-special-entertainment-liveries/) |
| PR-YSH | Airbus A320neo | family | [Source](https://www.aeromuseu.com.br/ACB_AZUL.htm) |
| PR-YSI | Airbus A320neo | family | [Source](https://www.aeromuseu.com.br/ACB_AZUL.htm) |
| PR-YSK | Airbus A320neo | family | [Source](https://www.aeromuseu.com.br/ACB_AZUL.htm) |
| PR-YJF | Airbus A321neo | family | [Source](https://aeromagazine.uol.com.br/artigo/azul-tera-o-aviao-da-margarida.html) |
| PR-YSR | Airbus A320neo | family | [Source](https://pt.linkedin.com/posts/azulinhasaereas_azul-goofy-frotamagica-activity-7200839894292684802-IF1J) |
| N537AS | Boeing 737-800 | type | [Source](https://www.alaskaair.com/content/travel-info/our-aircraft/737-800-friendship-and-beyond-disneyland-resort) |
| N538AS | Boeing 737-800 | type | [Source](https://news.alaskaair.com/alaska-airlines/starwars-galaxysedge-livery/) |
| N561JB | Airbus A320 | type | [Source](https://news.jetblue.com/latest-news/press-release-details/2025/Wahoo-JetBlue-Debuts-Special-Livery-Featuring-Mario-and-Friends/default.aspx) |
| VH-X4A | Airbus A220-300 | type | [Source](https://www.qantas.com/en-au/onboard/fleet/flying-art) |
| VH-ZND | Boeing 787-9 | type | [Source](https://www.qantas.com/en-au/onboard/fleet/flying-art) |
| VH-XZJ | Boeing 737-800 | type | [Source](https://www.qantas.com/en-au/onboard/fleet/flying-art) |

Validation: 597 server/unit tests passed, one skipped; production build passed. Headless Chromium verified the special-aircraft link with the provider type deliberately omitted, selection of the A330-300 asset, appearance-reference visibility, reload, mobile announcement layout and stale removal. The Browser plugin was unavailable, so the existing Playwright harness ran on a temporary local server (1440×1000 and 390×844). Evidence is saved outside the repository at `/tmp/skyward-browser-76f2_jbk`. Exact texture appearance was not certified by this interaction test. No deployment performed.

See the [complete model and livery source audit](special-aircraft-asset-search.md) for candidate downloads, compatibility limits and unresolved assets across all 120 registrations.
