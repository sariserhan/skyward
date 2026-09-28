import test from 'node:test';
import assert from 'node:assert/strict';
import {flightCardSVG} from '../src/lib/flightCard.ts';
test('Flight cards escape text and preserve unverified status without disclosing account metadata',()=>{
 const svg=flightCardSVG({callsign:'<script>alert(1)</script>',date:'2026-09-28',from:'IAD',to:'LHR',email:'private@example.test'});
 assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('private@example.test'));
 assert.match(svg,/status not verified/);assert.match(svg,/not a live tracker/);
});
