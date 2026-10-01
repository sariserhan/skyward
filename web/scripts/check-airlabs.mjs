import {airlabsUsageAllowed} from '../server/airlabs-permissions.mjs';
import {fetchAirLabsFlight, airlabsPreview} from '../server/airlabs.mjs';
const args = process.argv.slice(2);
try {
  if (!args.length) console.log(JSON.stringify(airlabsPreview('demo'), null, 2));
  else {
    if (args[0] !== '--live-once' || args.length < 2 || args.length > 3) throw new Error('Usage: npm run check:airlabs -- [--live-once ICAO_FLIGHT [HEX]]');
    // Operator-only CLI; intentionally not exposed through the public HTTP server.
    if(!airlabsUsageAllowed())throw Error('AirLabs usage terms remain unverified. No paid request was made.');
    const result = await fetchAirLabsFlight({apiKey: process.env.AIRLABS_API_KEY, callsign: args[1], hex: args[2]});
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
