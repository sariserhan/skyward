import {scheduleAirportCode} from './airlabs.mjs';
import timezones from '../data/airport-timezones.json' with {type:'json'};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function airportBoard(id,airport){
 const timezone=timezones[id]||'UTC';
 return `<link rel="stylesheet" href="/watch/airport-board.css"><div class="airport-board-links"><a href="/airports/${id}/">Explore ${escape(id)} on the globe</a><a href="/airports/">Change airport</a></div>
 <section class="airport-board" aria-label="Airport flight board" data-airport="${escape(id)}" data-timezone="${escape(timezone)}" data-supported="${!!scheduleAirportCode(id)}">
 <div class="board-masthead"><div><span class="board-kicker">FLIGHT INFORMATION</span><h2>${escape(id)} <span>${escape(airport.city||airport.name)}</span></h2></div><div class="board-clock"><time id="board-clock">Airport local time</time><small>${escape(timezone)}${timezones[id]?'':' · local timezone unavailable'}</small></div></div>
 <div class="board-actions"><div role="tablist" aria-label="Board direction"><button role="tab" id="departures-tab" aria-controls="board-panel" aria-selected="true" data-direction="departures">↗ Departures</button><button role="tab" id="arrivals-tab" aria-controls="board-panel" aria-selected="false" tabindex="-1" data-direction="arrivals">↙ Arrivals</button></div><button id="board-fullscreen" type="button">Full screen</button></div>
 <div class="board-tools"><label>Find a flight<input id="board-search" type="search" placeholder="Flight or airport" maxlength="80"></label><button id="board-refresh" type="button" disabled>Load departures</button></div>
 <p id="board-access" role="status">Checking schedule availability…</p><a id="board-account" href="/account/" hidden>Sign in / Premium</a>
 <div id="board-panel" role="tabpanel" aria-labelledby="departures-tab"><p id="board-update">No schedules loaded.</p><p id="board-error" role="alert" hidden></p>
 <div class="board-table-scroll" tabindex="0" role="region" aria-label="Scrollable flight board"><table><caption id="board-caption">${escape(id)} departures · airport-local dates and times</caption><thead><tr><th scope="col">Time</th><th scope="col">Flight</th><th scope="col" id="board-place">Destination</th><th scope="col">Terminal</th><th scope="col">Gate</th><th scope="col">Status</th></tr></thead><tbody id="board-rows"></tbody></table></div><p id="board-empty">Load the board to see available schedules.</p></div>
 <p class="board-note">Schedule data: AirLabs. Coverage and gate assignments vary. Missing gates are shown as “Not supplied”. Confirm your flight with the airline or airport. Schedule checks use your Premium allowance; shared results may be up to five minutes old.</p>
 </section><noscript><p>Enable JavaScript to load the flight board. <a href="/airports/${id}/">Airport information</a> remains available.</p></noscript><script type="module" src="/watch/airport-board.js"></script>`;
}
