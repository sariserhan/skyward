/** Server-only durable state for monitoring, push subscriptions and share tokens. */
export function sqlitePremiumStore(db){
 db.exec('CREATE TABLE IF NOT EXISTS premium_state(user_id TEXT NOT NULL,kind TEXT NOT NULL,key TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(user_id,kind,key)); CREATE TABLE IF NOT EXISTS premium_leases(key TEXT PRIMARY KEY,expires INTEGER NOT NULL);');
 return {
  get:(u,k,id)=>{const r=db.prepare('SELECT body FROM premium_state WHERE user_id=? AND kind=? AND key=?').get(u,k,id);return r?JSON.parse(r.body):null;},
  list:(u,k)=>db.prepare('SELECT key,body FROM premium_state WHERE user_id=? AND kind=?').all(u,k).map(r=>({key:r.key,value:JSON.parse(r.body)})),
  scan:k=>db.prepare("SELECT user_id,key,body FROM premium_state WHERE kind=? ORDER BY json_extract(body,'$.nextAt') LIMIT 500").all(k).map(r=>({userId:r.user_id,key:r.key,value:JSON.parse(r.body)})),
  find:(k,id)=>{const r=db.prepare('SELECT user_id,body FROM premium_state WHERE kind=? AND key=?').get(k,id);return r?{userId:r.user_id,value:JSON.parse(r.body)}:null;},
  put:(u,k,id,v,cap=50)=>{const r=db.prepare('INSERT INTO premium_state SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM premium_state WHERE user_id=? AND kind=?)<? OR EXISTS(SELECT 1 FROM premium_state WHERE user_id=? AND kind=? AND key=?) ON CONFLICT(user_id,kind,key) DO UPDATE SET body=excluded.body').run(u,k,id,JSON.stringify(v),u,k,cap,u,k,id);if(!r.changes)throw Object.assign(Error('Remove an item before adding another.'),{status:429});},
  drop:(u,k,id)=>db.prepare('DELETE FROM premium_state WHERE user_id=? AND kind=? AND key=?').run(u,k,id),
  claim:(key,now,ttl)=>{db.prepare('DELETE FROM premium_leases WHERE expires<?').run(now);return !!db.prepare('INSERT INTO premium_leases VALUES(?,?) ON CONFLICT(key) DO UPDATE SET expires=excluded.expires WHERE premium_leases.expires<=? RETURNING key').get(key,now+ttl,now);}
 };
}
export function postgresPremiumStore(pool,transaction){
 const rows=async(q,a)=>(await pool.query(q,a)).rows;
 return {
  get:async(u,k,id)=>(await rows('SELECT body FROM skyward_premium_state WHERE user_id=$1 AND kind=$2 AND key=$3',[u,k,id]))[0]?.body??null,
  list:async(u,k)=>(await rows('SELECT key,body AS value FROM skyward_premium_state WHERE user_id=$1 AND kind=$2',[u,k])),
  scan:async k=>(await rows("SELECT user_id AS \"userId\",key,body AS value FROM skyward_premium_state WHERE kind=$1 ORDER BY body->>'nextAt' LIMIT 500",[k])),
  find:async(k,id)=>(await rows('SELECT user_id AS "userId",body AS value FROM skyward_premium_state WHERE kind=$1 AND key=$2',[k,id]))[0]??null,
  put:async(u,k,id,v,cap=50)=>transaction(`premium:${u}:${k}`,async db=>{const old=await db.query('SELECT 1 FROM skyward_premium_state WHERE user_id=$1 AND kind=$2 AND key=$3',[u,k,id]);if(!old.rowCount&&Number((await db.query('SELECT COUNT(*) n FROM skyward_premium_state WHERE user_id=$1 AND kind=$2',[u,k])).rows[0].n)>=cap)throw Object.assign(Error('Remove an item before adding another.'),{status:429});await db.query('INSERT INTO skyward_premium_state VALUES($1,$2,$3,$4) ON CONFLICT(user_id,kind,key) DO UPDATE SET body=excluded.body',[u,k,id,JSON.stringify(v)]);}),
  drop:async(u,k,id)=>{await pool.query('DELETE FROM skyward_premium_state WHERE user_id=$1 AND kind=$2 AND key=$3',[u,k,id]);},
  claim:async(key,now,ttl)=>{await pool.query('DELETE FROM skyward_premium_leases WHERE expires<$1',[now]);return (await rows('INSERT INTO skyward_premium_leases VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET expires=excluded.expires WHERE skyward_premium_leases.expires<=$3 RETURNING key',[key,now+ttl,now])).length>0;}
 };
}
