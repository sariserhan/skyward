# Ground service models

Source: [mherweg/d-laser-fgtools, Models/lib](https://github.com/mherweg/d-laser-fgtools/tree/f2e7ff3c8b37e985041c68a58e68c51cfdb631eb/Models/lib), a FlightGear airport scenery collection.
Bundled under the upstream repository's GNU GPL v3 license (included as `LICENSE-GPL-3.0.txt`). Retain this license, attribution and the editable source files when redistributing these assets; do not represent these assets as original Skyward models.

Included models: `luggage-truck-HD`, `luggage-cart-HD`, `DFZ30`, `fuel-truck`, and `belt_loader`, with their referenced PNG textures. Upstream brand markings remain part of the supplied artwork and do not imply endorsement.

The original AC3D files are in `source/`. `tools/import_ground_services.py` converts them to Wavefront OBJ/MTL without paid tools. The source revision and texture hashes are pinned in `sources.json`. Conversion retains material colors, UVs and local translations; runtime normalizes dimensions and heading. Textures are shared and mipmapped. Meshes have a bounded visibility distance.

The concrete and building materials are Skyward procedural shaders. No ambientCG or Poly Haven material files were imported: their download endpoints were unavailable during this work.
