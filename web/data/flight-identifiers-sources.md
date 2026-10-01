# Passenger flight search aliases

Reviewed 2026-10-01. This is a bounded airline-designator table, not a global schedule or codeshare resolver. Numeric suffix equivalence is a search candidate, not proof of a ticketed journey. Never convert alphanumeric operational callsigns into invented passenger flight numbers. Keep the tracking code visible beside a passenger-code alias.

Sources:
- UA, AA, DL, AS, B6, F9, WN: https://www.aspm.faa.gov/aspmhelp/index/ASQP___Carrier_Codes_And_Names.html (exclude defunct/reassigned entries).
- A3, EI, SU, AR, AM: https://www.iata.org/en/about/members/airline-list/
- TK through BS: https://www.iata.org/en/about/members/airline-list/?ordering=Alphabetical&page=36&search=
- UJ through 3V: https://www.iata.org/en/about/members/airline-list/?ordering=Alphabetical&page=7&search=
- K6 through GL: https://www.iata.org/en/about/members/airline-list/?ordering=Alphabetical&page=3&search=
- EK: https://www.iata.org/en/about/members/airline-list/emirates/73/

Search is for current received aircraft activity, not historical/future departures. Flight numbers repeat; a specific journey needs operating carrier, flight number, scheduled departure date and origin/leg. Do not substitute observation date for departure date. Existing Premium dated flight detail checks compare date, route and aircraft identity. This free-feed search cannot verify arbitrary codeshares or scheduled journey identities; a no-match result must explain that limitation. More than one matching aircraft must not auto-select the first.
