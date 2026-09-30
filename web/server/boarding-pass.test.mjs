import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {parseBoardingPass,boardingDate} from '../src/lib/boardingPass.ts';
import {validateLibrary,createAccountLibrary} from './account-library.mjs';
const leg=({from='IAD',to='IST',carrier='TK',number='00008',day='273',seat='014A',extra=''}={})=>'PRIVATE'+from+to+carrier.padEnd(3)+number+day+'Y'+seat+'00001'+'1'+extra.length.toString(16).padStart(2,'0').toUpperCase()+extra;
const code=(legs=[leg()])=>'M'+legs.length+'SARI/SERHAN'.padEnd(20)+'E'+legs.join('');
test('BCBP keeps minimal trip fields and initials only, including multiple legs and variable data',()=>{
 const raw=code([leg({extra:'>5FAKEPRIVATEINFO'}),leg({from:'IST',to:'MAD',number:'01857',seat:'007F'})]),rows=parseBoardingPass(raw,2026);
 assert.equal(rows.length,2);assert.equal(rows[0].displayName,'S.S.');assert.equal(rows[0].flight,'TK8');assert.equal(rows[0].seat,'14A');assert.equal(rows[0].date,'2026-09-30');assert.equal(rows[1].flight,'TK1857');assert.equal(rows[1].seat,'7F');assert.ok(!JSON.stringify(rows).includes('PRIVATE'));assert.ok(!JSON.stringify(rows).includes('SERHAN'));
});
test('BCBP rejects truncated fields, invalid variable lengths, invalid days and malformed inputs',()=>{
 for(const raw of ['https://example.com',code().slice(0,-1),code().replace('273','000'),code().replace('273','999'),code().slice(0,-2)+'FF'])assert.throws(()=>parseBoardingPass(raw,2026));
 assert.throws(()=>boardingDate(366,2026),/leap/);assert.equal(boardingDate(366,2028),'2028-12-31');assert.equal(parseBoardingPass(code([leg({day:'001'})]),2027)[0].date,'2027-01-01');
});
test('Server boarding-pass allowlist discards raw documents, booking references and scanned identity',()=>{
 const value={displayName:'Serhan',flight:'TK008',date:'2026-09-30',from:'IAD',to:'IST',seat:'14A',callsign:'THY8',journeyKey:'',pnr:'SECRET',barcode:code(),fullName:'FULL NAME',image:'RAW',checkInSequence:'00001'};
 const saved=validateLibrary('boardingpasses',value);assert.deepEqual(Object.keys(saved).sort(),['callsign','date','displayName','flight','from','journeyKey','seat','to']);assert.equal(saved.displayName,'Serhan');assert.ok(!JSON.stringify(saved).includes('SECRET'));
 for(const bad of [{date:'2026-02-30'},{flight:'https://bad'},{seat:'<script>'},{displayName:'\u0000'},{from:'IAD',to:'IAD'}])assert.throws(()=>validateLibrary('boardingpasses',{...value,...bad}),e=>e.status===400);
});
test('Private pass library enforces entitlement, ownership, matching journey links and record limit',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('CREATE TABLE journeys(user_id TEXT,key TEXT,body TEXT);');let paid=true;const library=createAccountLibrary(db,{now:()=>1,entitlement:async()=>paid});
 const value={displayName:'S.S.',flight:'TK8',date:'2026-09-30',from:'IAD',to:'IST',seat:'14A',callsign:'THY8',journeyKey:''};
 async function call(user,method,body={},query='?kind=boardingpasses'){let result;await library('/api/account/library',method,{id:user},new URL('http://local/'+query),body,(_status,data)=>{result=data;});return result;}
 await call('a','POST',{kind:'boardingpasses',key:'one',revision:0,value});assert.equal((await call('a','GET')).items.length,1);assert.equal((await call('b','GET')).items.length,0);
 paid=false;await assert.rejects(call('a','POST',{kind:'boardingpasses',key:'two',revision:0,value}),e=>e.status===403);paid=true;
 const key='THY8:unassigned:2026-09-30';db.prepare('INSERT INTO journeys VALUES(?,?,?)').run('b',key,JSON.stringify({date:value.date,from:value.from,to:value.to,callsign:value.callsign}));await assert.rejects(call('a','POST',{kind:'boardingpasses',key:'two',revision:0,value:{...value,journeyKey:key}}),e=>e.status===400);
 for(let n=2;n<=50;n++)await call('a','POST',{kind:'boardingpasses',key:'p'+n,revision:0,value});await assert.rejects(call('a','POST',{kind:'boardingpasses',key:'full',revision:0,value}),e=>e.status===429);
 paid=false;await call('a','POST',{kind:'boardingpasses',key:'one',revision:1,remove:true});assert.equal((await call('a','GET')).items.length,49);
});
