shader_type spatial;
render_mode cull_disabled;
varying vec3 p;
varying vec3 surface_normal;
void vertex(){p=VERTEX;surface_normal=NORMAL;}
void fragment(){
 bool roof=abs(surface_normal.y)>.5;
 vec2 uv=roof?p.xz:vec2(dot(p.xz,vec2(-surface_normal.z,surface_normal.x)),p.y);
 vec2 size=roof?vec2(3.0):vec2(4.0,1.2);
 vec2 seams=min(fract(uv/size),1.0-fract(uv/size))*size;
 float aa=max(length(fwidth(uv)),.02);
 float joint=(1.0-smoothstep(.015,.015+aa,min(seams.x,seams.y)))*min(1.0,.05/aa);
 float stain=sin(uv.x*.035)*sin(uv.y*.043)*.02;
 float streak=pow(.5+.5*sin(uv.x*3.3+sin(uv.x*.7)),12.0)*.022;
 vec3 roofing=vec3(.23,.25,.255)+stain-joint*.08;
 vec3 cladding=vec3(.47,.49,.49)+stain-joint*.10-streak;
 ALBEDO=roof?roofing:cladding;
 ROUGHNESS=roof?.84:.64;
 METALLIC=roof?.12:.24;
 AO=1.0-joint*.2;
}
