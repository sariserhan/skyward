/** Hysteresis keeps adaptive rendering from oscillating after a single slow frame. */
export class ResolutionGovernor {
 private slow=0;private fast=0;private changed=0;private scale:number;
 private readonly maximum:number;
 constructor(maximum:number,now:number){this.maximum=maximum;this.scale=maximum;this.changed=now;}
 update(now:number,p95:number,rendered:number){
  if(rendered<2||!Number.isFinite(p95)||p95<=0){this.slow=0;this.fast=0;return this.scale;}
  this.slow=p95>45?this.slow+1:0;this.fast=p95<24?this.fast+1:0;
  if(now-this.changed>=8000&&this.slow>=3){this.scale=Math.max(Math.min(.7,this.maximum),Math.round((this.scale-.1)*100)/100);this.changed=now;this.slow=0;this.fast=0;}
  else if(now-this.changed>=30000&&this.fast>=15){this.scale=Math.min(this.maximum,Math.round((this.scale+.05)*100)/100);this.changed=now;this.fast=0;}
  return this.scale;
 }
}
