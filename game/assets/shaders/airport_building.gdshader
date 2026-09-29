shader_type spatial;
render_mode cull_disabled;
varying vec3 p;
varying float roof;
void vertex(){p=VERTEX;roof=abs(NORMAL.y);}
void fragment(){
 vec2 uv=p.xz;
 vec2 seams=min(fract(uv/3.0),1.0-fract(uv/3.0))*3.0;
 float aa=max(length(fwidth(uv)),0.02);
 float joint=(1.0-smoothstep(0.02,0.02+aa,min(seams.x,seams.y)))*min(1.0,0.05/aa);
 float stain=sin(uv.x*0.035)*sin(uv.y*0.043)*0.015;
 vec3 roofing=vec3(0.23,0.25,0.255)+stain-joint*0.08;
 ALBEDO=mix(vec3(0.40,0.43,0.44),roofing,step(0.5,roof));
 ROUGHNESS=0.83;
}
