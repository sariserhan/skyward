# Special-aircraft model and livery search — 1 October 2026

**Search completed across all 120 current featured registrations. All exact assets have not been found or integrated.** This is a sourcing audit, not a claim that every aircraft now has its real paint.

- Installed geometry: 64 exact-type matches, 23 family matches, 33 fallbacks after resolving B-18916 from the airline fleet listing.
- Additional model source candidates found for **25 of the 33 remaining fallback aircraft**. Candidate sources still require conversion, variant checks, texture work and browser validation.
- Simulator-livery candidates found for **15 registrations**. Some are search-index leads only; several require author permission or a proprietary simulator model. None was promoted to a ready-to-use exact livery.
- No purchase, account creation, author outreach, new API integration or deployment. No external assets were added to the runtime by this audit.

## What was searched

Ran a registration-specific search for every aircraft, plus targeted brand and missing-type searches. Inspected 886 FGMEMBERS repository names; fetched 20 relevant source trees at pinned commits and inspected their root license files where present. Inspected the FGx converted-model tree and the current FGAddon directory. Read all 25 FlightGear livery index pages (1,242 entries). The index does not expose every registration: absence from index text is not proof that an individual file lacks that paint. No exact special paint was certified from the index.

Machine-readable evidence:
- [All 120 aircraft, model leads and livery decisions](research/special-aircraft-assets-20261001.json)
- [Registration queries and discovery links](research/special-aircraft-searches-20261001.json)
- [Pinned model source trees and license evidence](research/special-model-sources-20261001.json)

## Livery download candidates

All rows below remain outside the runtime asset catalog. Finding a download page does not verify the files, commercial redistribution, the present-day paint scheme, or texture-coordinate compatibility with our models. `PAGE_CHECKED` means the listing was read, not that the archive was audited. `SEARCH_LISTING_ONLY` means the search index exposed the listing but the archive and terms were not checked.

| Registration | Candidate | Platform / status | Remaining work |
|---|---|---|---|
| N36NE | [New England Patriots 767 ](https://www.captainsim.com/cgi-bin/products.pl?action=show_liveries&product=b767) | FSX / Captain Sim / SEARCH_LISTING_ONLY | No commercial web reuse grant verified; requires another simulator model. |
| N225NE | [Patriots 767 repaint ](https://library.avsim.net/file/231931-boeing-767-300-ge-omni-air-international-new-england-patriots-n225ne) | Simulator repaint / SEARCH_LISTING_ONLY | Detail page unavailable to fetch; file and reuse terms not verified. |
| N25Y | [Flying Iron Lockheed P-38L Lightning - N25Y - Flying Bulls (Red Bull) Livery - Aircraft Liveries for MSFS / Flightsim.to ](https://flightsim.to/addon/21306/flying-iron-lockheed-p-38l-lightning-n25y-flying-bulls-red-bull-livery) | Other simulator / SEARCH_LISTING_ONLY | Discovery lead only: file, exact paint, model compatibility and commercial web reuse not verified. |
| N48RF | [NOAA N48RF livery for the Aerosoft DHC-6 Twin Otter Wheels Cargo version - Aircraft Liveries for MSFS / Flightsim.to ](https://da.flightsim.to/addon/27087/noaa-n48rf-livery-for-the-aerosoft-dhc-6-twin-otter-wheels-cargo-version) | Other simulator / SEARCH_LISTING_ONLY | Discovery lead only: file, exact paint, model compatibility and commercial web reuse not verified. |
| N746JB | [NY Jets FlightFactor A320 ](https://forum.inibuilds.com/files/file/3015-jetblue-flightfactor-a320-ny-jets-n746jb/) | X-Plane / FlightFactor / PAGE_CHECKED | Requires FlightFactor, Matavia and engine mod. Download sign-in and reuse review needed. |
| N595JB | [Boston Celtics FlightFactor A320 ](https://forum.inibuilds.com/files/file/3014-jetblue-flightfactor-a320-boston-celtics-n595jb/) | X-Plane / FlightFactor / PAGE_CHECKED | Requires FlightFactor, Matavia and engine mod. Base textures credited as permission-dependent. |
| N632JB | [Boston Bruins FSLabs listing ](https://liverydo.wixsite.com/liverydo/a320fslabs) | FSLabs / SEARCH_LISTING_ONLY | Registration in creator listing; download and reuse not verified. |
| N633JB | [Brooklyn Nets Fenix A320 ](https://flightsim.to/addon/69957/jetblue-bk-blue-brooklyn-nets-n623jb-fenixsim-a320-v2) | MSFS / Fenix / PERMISSION_REQUIRED | Author explicitly requires permission for modification and redistribution. URL has old typo; page identifies N633JB. |
| N605JB | [Blue Monster Red Sox Fenix A320 ](https://fr.flightsim.to/addon/73136/jetblue-blue-monster-n605jb-w-cabin-fenix-a320-v2-8k-4k) | MSFS / Fenix / SEARCH_LISTING_ONLY | Exact registration advertised; asset files, texture compatibility and reuse not verified. |
| 9M-MTL | [[LAMINAR A330] Malaysia Airlines [9M-MTL] Manchester United Special Livery - X-Plane.to ](https://new.x-plane.to/file/2216/laminar-a330-malaysia-airlines-9m-mtl-manchester-united-special-livery) | Other simulator / SEARCH_LISTING_ONLY | Discovery lead only: file, exact paint, model compatibility and commercial web reuse not verified. |
| TC-JNB | [Turkish Airlines Team Türkiye Livery (TC-JNB) - X-Plane.to ](https://sv.x-plane.to/file/1034/turkish-airlines-team-turkiye-livery-tc-jnb) | Other simulator / SEARCH_LISTING_ONLY | Discovery lead only: file, exact paint, model compatibility and commercial web reuse not verified. |
| N411DX | [Delta "Team USA" livery for X-Works A330 NEO - X-Plane.to ](https://fr.x-plane.to/file/320/delta-team-usa-livery-for-x-works-a330-neo) | Other simulator / SEARCH_LISTING_ONLY | Discovery lead only: file, exact paint, model compatibility and commercial web reuse not verified. |
| JA784A | [ANA Eevee Jet JA784A PMDG 777 repaint ](https://library.avsim.net/file/228773-p3dv5-pmdg-777-300er-ana-pokemon-eevee-jet-nh-ja784a) | P3D / PMDG / SEARCH_LISTING_ONLY | Registration-specific listing found; download, UV compatibility and redistribution terms not verified. |
| B-16332 | [EVA Air Laminar A330-300 Livery Three-Pack - X-Plane.to ](https://de.x-plane.to/file/1563/eva-air-laminar-a330-300-livery-three-pack) | Other simulator / SEARCH_LISTING_ONLY | Discovery lead only: file, exact paint, model compatibility and commercial web reuse not verified. |
| PR-YSR | [Azul Goofy A32NX ](https://flightsim.to/addon/70450/fbw-azul-pateta-nas-nuvens-disney-pr-ysr-8k) | MSFS / A32NX / PAGE_CHECKED | Artwork download page found; no applicable web redistribution grant verified. |

## Every remaining model gap

GPL source identifies a starting point, not a finished replica. Several files cover a related variant (for example EA300 versus Extra 330LX, or T-28D versus T-28B); those must not be relabeled as exact matches. Some root licenses were absent and remain unresolved. The EA300 README and bundled license wording also need version reconciliation.

| Registration | Aircraft | Source candidate | Status |
|---|---|---|---|
| N42RF | Lockheed WP-3D Orion | No free, reusable model verified in checked sources | Still open |
| N43RF | Lockheed WP-3D Orion | No free, reusable model verified in checked sources | Still open |
| N49RF | Gulfstream IV-SP | No free, reusable model verified in checked sources | Still open |
| N330AU | McDonnell Douglas MD-10-30F | [FGMEMBERS/MD-10](https://github.com/FGMEMBERS/MD-10/tree/c2aeb40f6a967f7d88b443f410023ff59d22309d) | GPL_SOURCE_CONVERSION_REQUIRED |
| OE-LDM | Douglas DC-6B | [FGMEMBERS/dc6](https://github.com/FGMEMBERS/dc6/tree/93b85a97efa5274cca16849c72aea5367e309ca2) | GPL_SOURCE_CONVERSION_REQUIRED |
| N25Y | Lockheed P-38 Lightning | [FGMEMBERS/P-38-Lightning](https://github.com/FGMEMBERS/P-38-Lightning/tree/cfe15819b10c8483eb2952f546f15be0a34bf2a3) | GPL_SOURCE_CONVERSION_REQUIRED |
| N46RF | De Havilland Canada DHC-6-300 Twin Otter | [FGMEMBERS/dhc6](https://github.com/FGMEMBERS/dhc6/tree/ed826b950acfe9aed737808f24ddb26a4f9a8c78) | LICENSE_REVIEW_REQUIRED |
| N48RF | De Havilland Canada DHC-6-300 Twin Otter | [FGMEMBERS/dhc6](https://github.com/FGMEMBERS/dhc6/tree/ed826b950acfe9aed737808f24ddb26a4f9a8c78) | LICENSE_REVIEW_REQUIRED |
| N56RF | De Havilland Canada DHC-6-300 Twin Otter | [FGMEMBERS/dhc6](https://github.com/FGMEMBERS/dhc6/tree/ed826b950acfe9aed737808f24ddb26a4f9a8c78) | LICENSE_REVIEW_REQUIRED |
| N57RF | De Havilland Canada DHC-6-300 Twin Otter | [FGMEMBERS/dhc6](https://github.com/FGMEMBERS/dhc6/tree/ed826b950acfe9aed737808f24ddb26a4f9a8c78) | LICENSE_REVIEW_REQUIRED |
| OE-XTV | Airbus Helicopters AS350 B3+ | [FGMEMBERS/AS350](https://github.com/FGMEMBERS/AS350/tree/d52b1d8e1d30eec8a9f6a33b8c74ec7f1dcb1386) | GPL_SOURCE_CONVERSION_REQUIRED |
| OE-CKW | Aviat Husky | No free, reusable model verified in checked sources | Still open |
| OE-ADM | Beechcraft T-34 Mentor | [FGMEMBERS/T-34](https://github.com/FGMEMBERS/T-34/tree/cd97bce474b3c101e8038e31f268777108549a44) | GPL_SOURCE_CONVERSION_REQUIRED |
| OE-XDM | Bell 47 G-3B-1 Soloy | No free, reusable model verified in checked sources | Still open |
| N11FX | Bell AH-1F Cobra | No free, reusable model verified in checked sources | Still open |
| D-HSDM | MBB BO105 C | [FGMEMBERS/bo105](https://github.com/FGMEMBERS/bo105/tree/42e171a4d1c49c3ebacdc168b56ffca0f8eb2284) | GPL_SOURCE_CONVERSION_REQUIRED |
| D-HTDM | MBB BO105 C | [FGMEMBERS/bo105](https://github.com/FGMEMBERS/bo105/tree/42e171a4d1c49c3ebacdc168b56ffca0f8eb2284) | GPL_SOURCE_CONVERSION_REQUIRED |
| D-HUDM | MBB BO105 S | [FGMEMBERS/bo105](https://github.com/FGMEMBERS/bo105/tree/42e171a4d1c49c3ebacdc168b56ffca0f8eb2284) | GPL_SOURCE_CONVERSION_REQUIRED |
| OE-XSY | Bristol 171 Sycamore | No free, reusable model verified in checked sources | Still open |
| N80FS | Canadair Sabre Mk6 | [FGMEMBERS/F-86](https://github.com/FGMEMBERS/F-86/tree/a4c4a6e0deee81dd10f148a634dd0da6512f40db) | LICENSE_REVIEW_REQUIRED |
| N991DM | Cessna 337 Skymaster | [FGMEMBERS/Cessna337](https://github.com/FGMEMBERS/Cessna337/tree/893e5a04f90c12ba631e87f748e1a4c9bfa49d5f) | GPL_SOURCE_CONVERSION_REQUIRED |
| OE-EAS | Vought F4U-4 Corsair | [FGMEMBERS/F4U](https://github.com/FGMEMBERS/F4U/tree/43e713e7fe7fbb519039d5db5aeff152a4fc0029) | LICENSE_REVIEW_REQUIRED |
| OE-ARN | Extra 330LX | [cobe571/EXTRA-EA300](https://github.com/cobe571/EXTRA-EA300/tree/78a586ea9d71ed26dfc49d62aebaf873de89433f) | GPL_SOURCE_CONVERSION_REQUIRED |
| OE-ARO | Extra 330LX | [cobe571/EXTRA-EA300](https://github.com/cobe571/EXTRA-EA300/tree/78a586ea9d71ed26dfc49d62aebaf873de89433f) | GPL_SOURCE_CONVERSION_REQUIRED |
| N50429 | Fairchild PT-19 | No free, reusable model verified in checked sources | Still open |
| N68RW | Grumman F8F-2 Bearcat | [FGMEMBERS/F8F-VooDooBear](https://github.com/FGMEMBERS/F8F-VooDooBear/tree/fbef3bb342832e3f5579af6bbb5fe2719c81fee1) | LICENSE_REVIEW_REQUIRED |
| N6123C | North American B-25J Mitchell | [FGMEMBERS/B-25](https://github.com/FGMEMBERS/B-25/tree/56d608dee3626de5c4272974e06bd1889b1da2ea) | GPL_SOURCE_CONVERSION_REQUIRED |
| OE-EFB | North American P-51D Mustang | [FGMEMBERS/p51d](https://github.com/FGMEMBERS/p51d/tree/cb3bcd6ef41182f6b1bae91395f38d0dadd974e5) | LICENSE_REVIEW_REQUIRED |
| OE-EMM | North American T-28B | [FGMEMBERS/North-American-T28D-Trojan](https://github.com/FGMEMBERS/North-American-T28D-Trojan/tree/2e0147565e2e93ec07611550433d74dde070433a) | GPL_SOURCE_CONVERSION_REQUIRED |
| OE-FSE | Vulcanair P.68TC Observer | [FlightGear FGAddon / Partenavia-P68](https://svn.code.sf.net/p/flightgear/fgaddon/trunk/Aircraft/Partenavia-P68/) | GPL_SOURCE_CONVERSION_REQUIRED |
| OE-EMD | Pilatus PC-6 Porter | [FGMEMBERS/PC-6](https://github.com/FGMEMBERS/PC-6/tree/e4b5776dde5b041171fb5a5ab641e92edc81ec7f) | LICENSE_REVIEW_REQUIRED |
| OE-AMM | Boeing PT-17 Stearman | [FGMEMBERS/Stearman](https://github.com/FGMEMBERS/Stearman/tree/db57b5b2c33eac5463c1b0ace6804ea1c265e306) | GPL_SOURCE_CONVERSION_REQUIRED |
| OE-ERB | North American T-6 | [FGMEMBERS/North-American-T6-Texan](https://github.com/FGMEMBERS/North-American-T6-Texan/tree/886ed8f9c313adadf0ea5bf229a8c9f265521f5e) | GPL_SOURCE_CONVERSION_REQUIRED |

## Rejected or unresolved apparent matches

- **N49RF NOAA:** the found MSFS livery paints a Citation Longitude; our aircraft is a Gulfstream IV-SP. Rejected as wrong geometry.
- **N330AU Orbis:** the GPL MD-10 repository includes Orbis textures, but their XML identifies N222AU and N220AU. Neither is an exact N330AU asset.
- **N661QX:** the result is a livery request, not a delivered downloadable asset.
- **N633JB Nets:** the Fenix author explicitly requires permission to modify or redistribute. A URL typo uses N623JB, while the page and correction identify N633JB. No copy imported.
- **FGx conversions:** many lack textures/normals and the project documents scale and missing-part issues. Kept as source leads, not installed as a visual improvement.
- **P-3 Orion:** a [TurboSquid candidate](https://www.turbosquid.com/3d-models/3d-p3-orion-1496481) is paid and depicts a P-3C, not the NOAA WP-3D. Excluded from the free import path.
- **Gulfstream IV:** a [Sketchfab candidate](https://sketchfab.com/3d-models/gulfstream-g-iv-g400-3d-printable-model-9113757d3387496d99f7b73dfa86978a) is a high-poly printable store model. No free web-ready asset verified.
- **Husky:** an [AVSIM freeware listing](https://library.avsim.net/file/58010-aviat-husky-a1-b-with-tunda-tires) exists; free download alone does not establish modification/redistribution rights or compatibility.
- **AH-1:** [FlightGear wiki candidate](https://wiki.flightgear.org/AH-1) is a SuperCobra, and the linked repository is in FGMEMBERS-NONGPL. Not an exact licensed AH-1F replacement.
- **PT-19:** [CGTrader model listing](https://www.cgtrader.com/3d-models/aircraft/historic-aircraft/fairchild-pt-19-cornell) found; no free reusable asset verified.
- **Bell 47:** [Highend3D model listing](https://www.highend3d.com/3d-model/helicopter-bell-47-3d-model) found; price, distribution rights and G-3B-1 Soloy variant not verified.
- **Bristol Sycamore:** no suitable free reusable mesh located in these searches.

## Applied correction

B-18916 was catalogued only as A350. The [China Airlines fleet table](https://www.china-airlines.com/tw/en/Images/%E8%88%AA%E7%A9%BA%E5%99%A8%E8%B3%87%E8%A8%8A_20260320_tcm264-3270.pdf) identifies A350-900. The search index exposed the complete row; direct PDF retrieval returned 403. The catalog now selects the existing A359 geometry if the feed omits the type. Pokémon paint is still not imported.

## Remaining work

Convert and visually validate the GPL source candidates, keeping full attribution and editable source. Obtain usable texture permissions and remap those textures to the licensed geometry, or author original special paint where no compatible asset is available. A dedicated 3D asset pass is still required; downloading arbitrary simulator archives is not enough.
