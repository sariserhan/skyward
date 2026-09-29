shader_type spatial;
varying vec2 p;
float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 v){vec2 i=floor(v);vec2 f=fract(v);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void vertex(){p=(MODEL_MATRIX*vec4(VERTEX,1.0)).xz;}
void fragment(){
 float patches=noise(p/270.0)*0.55+noise(p/65.0)*0.30+noise(p/13.0)*0.15;
 vec3 grass=mix(vec3(0.12,0.17,0.085),vec3(0.26,0.27,0.16),patches);
 float detail=(noise(p*0.6)-0.5)*0.025/(1.0+length(fwidth(p)));
 ALBEDO=grass+detail;ROUGHNESS=1.0;
}
