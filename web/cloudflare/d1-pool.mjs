/** Adapter for the application's finite SQL vocabulary, not a general PG driver.
 * All callers run through one serialized coordinator. Mutations in a transaction
 * are committed atomically with D1.batch; failed validation performs no writes.
 */
export function d1Statement(sql,args=[]){
 let query=sql.replace(/\s+FOR UPDATE\b/gi,'').replace(/::(?:integer|jsonb|text)\b/g,'')
  .replace(/octet_length\(([^()]+)\)/gi,'length(CAST($1 AS BLOB))')
  .replace(/\bLEAST\(/g,'MIN(').replace(/\bGREATEST\(/g,'MAX(')
  .replace(/body->>'nextAt'/g,"json_extract(body,'$.nextAt')");
 const values=[];query=query.replace(/\$(\d+)/g,(_,i)=>{const v=args[Number(i)-1];if(v===undefined)throw Error('Missing SQL parameter');values.push(typeof v==='boolean'?Number(v):v);return '?';});
 if(/\b(?:BEGIN|COMMIT|ROLLBACK|pg_advisory|hashtextextended)\b|::|\$\d/.test(query))throw Error('Unsupported D1 SQL');
 return {sql:query,values};
}
function decoded(result){const rows=(result.results??[]).map(row=>{const out={...row};for(const key of ['body','detail','value'])if(typeof out[key]==='string'){try{out[key]=JSON.parse(out[key]);}catch{}}return out;});return {rows,rowCount:rows.length||result.meta?.changes||0};}
export function d1Pool(binding){
 let pending=null,wrote=false;
 const prepare=(q,args)=>{const {sql,values}=d1Statement(q,args);return binding.prepare(sql).bind(...values);};
 const pool={async query(q,args=[]){
  const read=/^\s*SELECT\b/i.test(q),statement=prepare(q,args);
  if(pending&&!read){if(/\bRETURNING\b/i.test(q))throw Error('Queued writes cannot return rows');pending.push(statement);wrote=true;return {rows:[],rowCount:0};}
  if(pending&&read&&wrote)throw Error('Read-after-write requires an explicit D1 batch design');
  return decoded(await statement.all());
 },async end(){}};
 async function transaction(_lock,action){
  if(pending)throw Error('Nested D1 transaction');pending=[];wrote=false;
  try{const result=await action(pool),writes=pending;if(writes.length)await binding.batch(writes);return result;}finally{pending=null;wrote=false;}
 }
 return {pool,transaction};
}
