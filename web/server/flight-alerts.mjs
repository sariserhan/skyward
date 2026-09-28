export function changesSince(before,after) {
  if(!before||!after)return [];
  const messages=[];
  if(before.status!==after.status&&after.status)messages.push(after.status==='landed'?'Arrival reported':after.status==='en-route'?'Departure reported':`Flight status: ${after.status}`);
  for(const side of ['departure','arrival']) {
    const a=before[side],b=after[side];if(!a||!b)continue;
    if(a.terminal&&b.terminal&&a.terminal!==b.terminal)messages.push(`${side==='departure'?'Departure':'Arrival'} terminal changed: ${a.terminal} → ${b.terminal}`);
    if(a.gate&&b.gate&&a.gate!==b.gate)messages.push(`${side==='departure'?'Departure':'Arrival'} gate changed: ${a.gate} → ${b.gate}`);
    if(a.estimatedAt&&b.estimatedAt&&b.estimatedAt-a.estimatedAt>=300000)messages.push(`${side==='departure'?'Departure':'Arrival'} estimate delayed by ${Math.round((b.estimatedAt-a.estimatedAt)/60000)} minutes`);
  }
  return messages;
}

