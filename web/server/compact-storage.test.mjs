import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAccountLibrary,validateLibrary,ACCOUNT_LIBRARY_BYTES} from './account-library.mjs';

function fixture(){const db=new DatabaseSync(':memory:');const handle=createAccountLibrary(db,{now:()=>1000,entitlement:async()=>true});
 return {db,async call(user,body,query=''){let result;await handle('/api/account/library',body?'POST':'GET',{id:user},new URL('https://example.test/api/account/library'+query),body,(status,data)=>result={status,data});return result.data;}};}
test('account summaries discard bulk simulation fields and reject raw recordings/photos',()=>{
 const result=validateLibrary('missions',{from:'IAD',to:'DCA',difficulty:'easy',result:'landed',duration:400,touchdownRate:-120,replay:{samples:Array(10000).fill({lat:40})},unknown:'x'.repeat(10000)});
 assert.equal(result.replay,undefined);assert.equal(result.unknown,undefined);assert.ok(JSON.stringify(result).length<1000);
 const summary=validateLibrary('simulator',{kind:'career',career:{day:4,cash_cents:10000,airport_name:'Dulles',ledger:['do not store'],progress:{huge:'x'.repeat(10000)}},day:{aircraft:['private snapshot']}});
 assert.equal(summary.kind,'career-progress');assert.equal(summary.day,4);assert.equal(summary.ledger,undefined);assert.equal(summary.progress,undefined);assert.ok(JSON.stringify(summary).length<1024);
 for(const [kind,value] of [['recordings',{tracks:[]}],['journal',{date:'2026-09-29',airport:'IAD',photo:'data:image/png;base64,YQ=='}]])assert.throws(()=>validateLibrary(kind,value),e=>e.status===413);
});
test('unchanged saves cause no row updates; conflicts and account isolation remain enforced',async t=>{
 const f=fixture();t.after(()=>f.db.close());const body={kind:'views',key:'one',revision:0,value:{name:'My view',settings:{}}};
 const saved=await f.call('a',body);assert.equal(saved.revision,1);const changes=f.db.prepare('SELECT total_changes() n').get().n;
 assert.equal((await f.call('a',{...body,revision:1})).unchanged,true);assert.equal(f.db.prepare('SELECT total_changes() n').get().n,changes);
 await assert.rejects(f.call('a',body),e=>e.status===409);await assert.rejects(f.call('b',null,'?kind=views&key=one'),e=>e.status===404);
 await f.call('b',body);assert.equal((await f.call('b',null,'?kind=views')).items.length,1);
});
test('combined payload cap covers different libraries and byte counts include UTF-8; legacy data remains exportable/deletable',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const old=JSON.stringify({name:'Legacy recording',tracks:[],padding:'x'.repeat(ACCOUNT_LIBRARY_BYTES)});
 f.db.prepare('INSERT INTO account_library VALUES(?,?,?,?,?,?)').run('a','recordings','old',old,1,100);
 assert.equal((await f.call('a',null,'?kind=recordings&key=old')).value.name,'Legacy recording');
 await assert.rejects(f.call('a',{kind:'views',key:'new',revision:0,value:{settings:{}}}),e=>e.status===413);
 await f.call('b',{kind:'views',key:'new',revision:0,value:{settings:{}}});
 await f.call('a',{kind:'recordings',key:'old',revision:1,remove:true});
 await f.call('a',{kind:'views',key:'new',revision:0,value:{settings:{}}});
 // Fill all but ~2.5 KB, then add valid multi-byte text: byte accounting
 // must reject it even though its JavaScript string length fits.
 f.db.prepare('INSERT INTO account_library VALUES(?,?,?,?,?,?)').run('a','recordings','near-limit',JSON.stringify({padding:'x'.repeat(ACCOUNT_LIBRARY_BYTES-2500)}),1,100);
 await assert.rejects(f.call('a',{kind:'journal',key:'utf8',revision:0,value:{date:'2026-09-29',airport:'IAD',notes:'界'.repeat(1000),airline:'界'.repeat(80),collection:'界'.repeat(50),registration:'界'.repeat(32),aircraftType:'界'.repeat(20),callsign:'界'.repeat(16)}}),e=>e.status===413);
});
