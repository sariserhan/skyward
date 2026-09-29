/** Bounded speculative elevation corridor. No observations or API calls are invented. */
export function sceneryAhead(lon:number,lat:number,heading:number|null,knots:number|null){
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lat)>90)return [];
 const points=[{lon:((lon+540)%360)-180,lat}];
 if(heading==null||knots==null||!Number.isFinite(heading)||!Number.isFinite(knots)||knots<=0)return points;
 const rad=Math.PI/180,bearing=heading*rad,latitude=lat*rad,longitude=lon*rad;
 for(const seconds of [30,90]){
  const distance=Math.min(700,knots)*seconds/3600/3440.065;
  const phi=Math.asin(Math.sin(latitude)*Math.cos(distance)+Math.cos(latitude)*Math.sin(distance)*Math.cos(bearing));
  const lambda=longitude+Math.atan2(Math.sin(bearing)*Math.sin(distance)*Math.cos(latitude),Math.cos(distance)-Math.sin(latitude)*Math.sin(phi));
  points.push({lat:phi/rad,lon:((lambda/rad+540)%360)-180});
 }
 return points;
}
