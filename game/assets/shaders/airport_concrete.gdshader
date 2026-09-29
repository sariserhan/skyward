shader_type spatial;
render_mode cull_disabled;
varying vec3 world_position;
uniform float wetness : hint_range(0.0, 1.0) = 0.0;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void vertex() { world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz; }
void fragment() {
 vec2 p=world_position.xz;
 vec2 cell=floor(p/6.0);
 vec2 edge=min(fract(p/6.0),1.0-fract(p/6.0))*6.0;
 float aa=max(length(fwidth(p)),0.015);
 float joint=1.0-smoothstep(0.015,0.015+aa,min(edge.x,edge.y));
 joint*=min(1.0,0.06/aa);
 float variation=(hash(cell)-0.5)*0.055;
 float grain=(hash(floor(p*18.0))-0.5)*0.02/(1.0+aa*18.0);
 ALBEDO=(vec3(0.43,0.44,0.42)+variation+grain-joint*0.1)*(1.0-wetness*0.22);
 ROUGHNESS=mix(0.9,0.38,wetness);
}
