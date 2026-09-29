shader_type spatial;
render_mode cull_disabled;
varying vec3 world_position;
uniform float wetness : hint_range(0.0, 1.0) = 0.0;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y); }
void vertex() { world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz; }
void fragment() {
 vec2 p=world_position.xz;
 vec2 cell=floor(p/6.0);
 vec2 edge=min(fract(p/6.0),1.0-fract(p/6.0))*6.0;
 float aa=max(length(fwidth(p)),0.015);
 float joint=(1.0-smoothstep(0.015,0.015+aa,min(edge.x,edge.y)))*min(1.0,0.06/aa);
 float variation=(hash(cell)-0.5)*0.035;
 float mottling=(noise(p*.7)-.5)*.045+(noise(p*3.0)-.5)*.024;
 float grain=(noise(p*38.0)-.5)*.075/(1.0+aa*25.0);
 float damp=smoothstep(.35,.78,noise(p*.13))*wetness;
 ALBEDO=(vec3(.43,.44,.42)+variation+mottling+grain-joint*.13)*(1.0-damp*.28);
 ROUGHNESS=mix(.88+grain,.35,damp);
 AO=1.0-joint*.18;
 // Microscopic aggregate relief fades out with distance to avoid crawling pixels.
 float detail=.055/(1.0+aa*35.0);
 vec2 slope=vec2(noise(p*38.0+vec2(.25,0))-noise(p*38.0-vec2(.25,0)),noise(p*38.0+vec2(0,.25))-noise(p*38.0-vec2(0,.25)))*detail;
 NORMAL=normalize(NORMAL+(VIEW_MATRIX*vec4(-slope.x,0,-slope.y,0)).xyz);
}
