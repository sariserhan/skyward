shader_type spatial;
uniform float wetness : hint_range(0.0,1.0) = 0.0;
varying vec2 p;
float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 v){vec2 i=floor(v),f=fract(v);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void vertex(){p=(MODEL_MATRIX*vec4(VERTEX,1.0)).xz;}
void fragment(){
 float footprint=max(length(fwidth(p)),.01);
 float aggregate=(noise(p*27.0)-.5)*.045/(1.0+footprint*25.0);
 float repairs=noise(p*.04)*.045+noise(p*.32)*.016;
 float damp=wetness*smoothstep(.28,.75,noise(p*.08));
 ALBEDO=(vec3(.115,.125,.13)+repairs+aggregate)*(1.0-damp*.32);
 ROUGHNESS=mix(.94,.27,damp);SPECULAR=mix(.3,.55,damp);
}
