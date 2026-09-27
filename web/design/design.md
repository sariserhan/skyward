# Skyward visual specification

Built-in Image Gen concept: `skyward-concept.png` (full desktop screen).
Direction: a quiet, midnight-blue aviation observatory with a large Atlantic
hemisphere, mint observed-aircraft markers, an airport/aircraft rail, and a
persistent flight inspector. Controls and the map are real code, never a raster UI.

Tokens: background #09141c; rail #101f2a; line #263d4b; text #edf4f6;
secondary #9bb4c4; accent #8fdfc8; warning #e5b97b. Sans-serif UI, monospace
measurements. 68px top navigation, 310px desktop rail, 24px primary padding,
8px panel radii, 12–14px UI type and 27px map title. Compact separator-based
rows, no decorative card grid. Active states use a quiet mint fill.

Functional differences from concept: live aircraft replace invented example
rows; UTC is the actual clock; feed errors, last observation timestamps, and
unknown routes/gates must be visible. Airport focus, global lookup, watchlist,
observed-trail replay, data explanation, and mobile sidebar need working controls.
The globe uses locally stored Natural Earth geography rather than imagery.
