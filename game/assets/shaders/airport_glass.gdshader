shader_type spatial;
render_mode cull_disabled;
uniform float night : hint_range(0.0,1.0) = 0.0;
varying vec3 p;
varying vec3 face;
float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}
void vertex(){p=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;face=normalize((MODEL_MATRIX*vec4(NORMAL,0.0)).xyz);}
void fragment(){
 vec2 uv=vec2(dot(p.xz,vec2(-face.z,face.x)),p.y);
 vec2 cell=floor(uv/vec2(3.2,3.8));vec2 room=fract(uv/vec2(3.2,3.8));
 vec2 aa=max(fwidth(uv)/vec2(3.2,3.8),vec2(.002));
 float pane=smoothstep(.012,.012+aa.x,room.x)*(1.0-smoothstep(.986-aa.x,.986,room.x));
 pane*=smoothstep(.018,.018+aa.y,room.y)*(1.0-smoothstep(.982-aa.y,.982,room.y));
 float ceiling=smoothstep(.83,.9,room.y)*(1.0-smoothstep(.92,.97,room.y));
 float room_light=step(.28,hash(cell));
 float blinds=step(.82,hash(cell+7.0))*(.5+.5*sin(uv.y*28.0))*.025/(1.0+length(fwidth(uv))*12.0);
 float fresnel=pow(1.0-clamp(dot(normalize(NORMAL),normalize(VIEW)),0.0,1.0),4.0);
 vec3 interior=mix(vec3(.035,.075,.09),vec3(.075,.12,.14),hash(cell+3.0));
 ALBEDO=mix(vec3(.18,.22,.23),interior+blinds+fresnel*vec3(.12,.18,.21),pane);
 ROUGHNESS=mix(.55,.18,pane);METALLIC=.28*pane;SPECULAR=.75;
 EMISSION=pane*room_light*night*(vec3(.5,.37,.2)*.28+ceiling*vec3(1.0,.82,.57)*1.2);
}
