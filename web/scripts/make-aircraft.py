"""Original illustrative aircraft geometry; locally sourced logos identify operators.
Coordinates: X nose, Y lateral, Z up; glTF +Z forward, +Y up.
"""
import json, math, struct, argparse, zlib, random
parser=argparse.ArgumentParser();parser.add_argument("--profile");args=parser.parse_args()
from pathlib import Path
out=Path(__file__).resolve().parents[1]/'public/models/fleet';out.mkdir(parents=True,exist_ok=True)
# Shared subtle panel seams / paint variation; original procedural texture.
def paint_texture():
    rng=random.Random(734);raw=bytearray()
    for y in range(512):
        raw.append(0)
        for x in range(1024):
            value=250+rng.randrange(-2,3)
            if x%128==0 or y%128==0:value-=11
            elif (x%128 in [3,125] and y%12==0) or (y%128 in [3,125] and x%12==0):value-=16
            raw.extend((value,value,min(255,value+1),255))
    def chunk(kind,body):return struct.pack('>I',len(body))+kind+body+struct.pack('>I',zlib.crc32(kind+body)&0xffffffff)
    (out/'fallback-paint-v5.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1024,512,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))
paint_texture()
profiles={'a319':(34,34,4,2),'a320':(38,35,4,2),'a321':(45,36,4,2),'a220':(38,35,3.5,2),'b737':(40,35,3.8,2),'b737max':(40,36,3.8,2),'b757':(47,38,3.8,2),'b767':(55,48,5,2),'b777':(74,65,6.2,2),'b787':(63,60,5.8,2),'a330':(64,60,5.6,2),'a350':(67,65,6,2),'a380':(73,80,8,4),'b747':(71,65,6.5,4),'regional':(32,27,3,2),'bizjet':(22,21,2.5,2),'turboprop':(23,26,2.8,2),'light':(9,11,1.4,1),'generic':(40,36,4,2)}
paints={'neutral':'70899c','THY':'c81932','UAL':'2266bd','AAL':'397daf','DAL':'b71b39','BAW':'263f81','DLH':'173c72','AFR':'263d7e','KLM':'23a5d5','QTR':'721e49','UAE':'ca2635','PGT':'e5b620','SWA':'254cc2','JBU':'193979','ETH':'258b50','SAS':'234d9b'}
profiles.update({'b772':(64,61,6.2,2),'b788':(57,60,5.8,2),'b78x':(68,60,5.8,2),'a35k':(74,65,6,2),'e190':(36,29,3,2),'crj':(36,25,2.7,2),'pc12':(14,16,1.5,1)})
paints.update({'RYR': '16457c', 'EZY': 'f16b22', 'WZZ': 'c5197b', 'SIA': '172f5c', 'CPA': '126259', 'ANA': '234d9b', 'JAL': 'c81932', 'QFA': 'cb2033', 'ACA': 'b51c30'})
fan_rigs={};detail_rigs={}
for name,(L,span,dia,engines) in profiles.items():
    if args.profile and name!=args.profile:continue
    family={'b772':'b777','b788':'b787','b78x':'b787','a35k':'a350'}.get(name,name)
    r=dia/2;groups=[[] for _ in range(11)];wing_groups=[];fan_groups=[];fan_hubs=[];surface_groups={};surface_specs={};wheel_hubs=[]
    # Family proportions are illustrative, not engineering drawings.
    sweep={'a220':.15,'a319':.16,'a320':.16,'a321':.17,'b757':.18,'b767':.18,'b777':.20,'b787':.21,'a330':.20,'a350':.22,'a380':.18,'b747':.20,'bizjet':.22,'regional':.15,'e190':.17,'crj':.20}.get(family,.19)
    fin_height={'a380':.12,'b747':.13,'b777':.12,'b787':.12,'a350':.12,'bizjet':.18,'crj':.16,'light':.12,'pc12':.15}.get(family,.145)
    def capture_surface(key,kind,pivot,axis,sign,start):
        target=surface_groups.setdefault(key,[])
        target.extend((m,g[start[m]:]) for m,g in enumerate(groups) if len(g)>start[m])
        for m,g in enumerate(groups):del g[start[m]:]
        surface_specs[key]={'kind':kind,'pivot':[pivot[1],pivot[2],pivot[0]],'axis':axis,'sign':sign}

    def tri(a,b,c,mat=0,normals=None,uv=None):
        u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)];n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];d=math.sqrt(sum(x*x for x in n)) or 1;n=tuple(x/d for x in n)
        for i,p in enumerate([a,b,c]):groups[mat].append((p,normals[i] if normals else n,uv[i] if uv else (0,0)))
    def quad(a,b,c,d,mat=0):tri(a,b,c,mat);tri(a,c,d,mat)
    def smooth_rings(rings):
        # Subdivide longitudinal profiles for rounded noses, cowls and tail cones.
        smooth=[]
        for i,(a,b) in enumerate(zip(rings,rings[1:])):
            prev=rings[max(0,i-1)];following=rings[min(len(rings)-1,i+2)]
            for step in range(4):
                t=step/4
                def blend(k):
                    m0=(b[k]-prev[k])*.5;m1=(following[k]-a[k])*.5
                    value=(2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*m0+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*m1
                    return max(min(a[k],b[k]),min(max(a[k],b[k]),value))
                smooth.append((a[0]+(b[0]-a[0])*t,max(.001,blend(1)),blend(2),blend(3)))
        return smooth+[rings[-1]]
    def tube(rings,mat=0,ellipse=1):
        rings=smooth_rings(rings)
        for index,((x,rad,y,z),(xx,rr,yy,zz)) in enumerate(zip(rings,rings[1:])):
            def n(t,index):
                a=rings[max(0,index-1)];b=rings[min(len(rings)-1,index+1)];dx=b[0]-a[0]
                slope=-(b[1]-a[1]+math.cos(t)*(b[2]-a[2])+math.sin(t)*(b[3]-a[3])/ellipse)/(dx if abs(dx)>.00001 else .00001)
                value=(slope,math.cos(t),math.sin(t)/ellipse);length=math.sqrt(sum(k*k for k in value));return tuple(k/length for k in value)
            for j in range(64):
                t=j*math.tau/64;u=(j+1)*math.tau/64
                a=(x,y+rad*math.cos(t),z+ellipse*rad*math.sin(t));b=(x,y+rad*math.cos(u),z+ellipse*rad*math.sin(u));c=(xx,yy+rr*math.cos(u),zz+ellipse*rr*math.sin(u));d=(xx,yy+rr*math.cos(t),zz+ellipse*rr*math.sin(t))
                tri(a,b,c,mat,[n(t,index),n(u,index),n(u,index+1)],uv=[(x/L+.5,j/64),(x/L+.5,(j+1)/64),(xx/L+.5,(j+1)/64)]);tri(a,c,d,mat,[n(t,index),n(u,index+1),n(t,index+1)],uv=[(x/L+.5,j/64),(xx/L+.5,(j+1)/64),(xx/L+.5,j/64)])
    def foil(points,thick=.10,mat=1):
        top=[(x,y,z+thick) for x,y,z in points];bottom=[(x,y,z-thick) for x,y,z in points]
        for i in range(1,len(points)-1):tri(top[0],top[i],top[i+1],mat);tri(bottom[0],bottom[i+1],bottom[i],mat)
        for i in range(len(points)):j=(i+1)%len(points);quad(top[i],bottom[i],bottom[j],top[j],mat)
    def airfoil(side,tipx,wingz):
        # A cambered section with rounded leading edge and a tapered trailing edge.
        sections=[(r*.75,.10*L,-.17*L,wingz,.105),(span*.22,-.015*L,-.19*L,wingz+.28,.09),(span*.45,tipx,tipx-.075*L,.7,.065),(span*.5,tipx-.015*L,tipx-.07*L,1.4 if family in ['b787','a350'] else .9,.045)]
        if name in ['light','turboprop','pc12']:sections=[(r*.75,.10*L,-.17*L,wingz,.12),(span*.45,tipx,tipx-.11*L,wingz+.25,.09),(span*.5,tipx-.015*L,tipx-.09*L,wingz+.4,.07)]
        def point(section,u,sign):
            y,lead,trail,z,thickness=section;chord=lead-trail
            h=5*thickness*(.2969*math.sqrt(u)-.126*u-.3516*u*u+.2843*u**3-.1036*u**4)*chord
            return (lead-chord*u,side*y,z+.015*chord*math.sin(math.pi*u)+sign*h)
        for a,b in zip(sections,sections[1:]):
            for sign in [-1,1]:
                for j in range(24):
                    u=(1-math.cos(math.pi*j/24))/2;v=(1-math.cos(math.pi*(j+1)/24))/2
                    start=[len(g) for g in groups]
                    quad(point(a,u,sign),point(b,u,sign),point(b,v,sign),point(a,v,sign),1)
                    kind='flap' if u>=.82 else 'slat' if v<=.06 else 'spoiler' if sign==1 and u>=.60 and v<=.80 else None
                    if kind and b[0]<=span*.45:
                        pivot=point(sections[0],.82 if kind=='flap' else .06 if kind=='slat' else .60,1)
                        capture_surface(kind.title()+('L' if side<0 else 'R'),kind,pivot,0,1,start)
                # Fine spoiler/flap seams and leading-edge metal strips.
                for u in [.68,.82]:
                    aa=point(a,u,1);bb=point(b,u,1);cc=point(b,u+.003,1);dd=point(a,u+.003,1)
                    quad(*[(x,y,z+.008) for x,y,z in [aa,bb,cc,dd]],6)
        for a in [sections[0],sections[-1]]:
            for j in range(24):quad(point(a,j/24,-1),point(a,j/24,1),point(a,(j+1)/24,1),point(a,(j+1)/24,-1),1)
        if L>25:
            for fraction in [.16,.29,.39]:
                y=side*span*fraction;a,b=next((a,b) for a,b in zip(sections,sections[1:]) if a[0]<=abs(y)<=b[0]);t=(abs(y)-a[0])/(b[0]-a[0]);x=a[2]+(b[2]-a[2])*t+L*.008;z=a[3]+(b[3]-a[3])*t-.10
                tube([(x-.045*L,.005,y,z),(x-.025*L,.16,y,z),(x+.02*L,.19,y,z),(x+.04*L,.005,y,z)],1)
    nose=[(.34,1),(.39,.91),(.44,.68),(.477,.38),(.5,.01)] if name.startswith('a') else [(.31,1),(.37,.96),(.425,.76),(.47,.39),(.5,.01)]
    if name in ['bizjet','crj']:nose=[(.27,1),(.34,.91),(.41,.66),(.465,.31),(.5,.01)]
    elif name=='a220':nose=[(.32,1),(.38,.93),(.43,.74),(.477,.36),(.5,.01)]
    body_rings=[(x*L,rr*r,0,0) for x,rr in [(-.5,.015),(-.47,.22),(-.42,.48),(-.35,.8),(-.27,.98),(-.19,1)]+nose]
    tube(body_rings,ellipse=1.18 if name=='a380' else 1)
    skin=smooth_rings(body_rings)
    hump=smooth_rings([(.01*L,.01,0,r*.68),(.08*L,r*.58,0,r*.68),(.28*L,r*.62,0,r*.68),(.36*L,r*.40,0,r*.6),(.41*L,.01,0,r*.5)]) if name=='b747' else []
    def body_radius(x):
        for a,b in zip(skin,skin[1:]):
            if a[0]<=x<=b[0]:return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])
        return .01
    def cockpit_patch(side,x0,x1,angle0,angle1):
        # Follow exactly the same sampled skin as the nose; keep the glass and
        # seals outside it. Subdivision stops long flat panes sinking into it.
        def point(u,v,lift):
            x=(x0+(x1-x0)*u)*L;angle=(angle0+(angle1-angle0)*v)*math.pi/180
            radius=body_radius(x)+lift
            if hump:
                a,b=next((a,b) for a,b in zip(hump,hump[1:]) if a[0]<=x<=b[0]);t=(x-a[0])/(b[0]-a[0]);rr=a[1]+(b[1]-a[1])*t;center=a[3]+(b[3]-a[3])*t
                z=center+(rr+lift)*math.sin(angle);y=max((rr+lift)*math.cos(angle),math.sqrt(max(0,body_radius(x)**2-z*z))+lift)
                return (x,side*y,z)
            return (x,side*radius*math.cos(angle),radius*math.sin(angle)*(1.18 if name=='a380' else 1))
        for i in range(8):
            for j in range(6):quad(point(i/8,j/6,.035),point((i+1)/8,j/6,.035),point((i+1)/8,(j+1)/6,.035),point(i/8,(j+1)/6,.035),3)
        # Thin perimeter seals frame each pane without covering its glazing.
        for i in range(12):
            t=i/12;u=(i+1)/12
            for v in [0,1]:quad(point(t,v,.045),point(u,v,.045),point(u,v+(.035 if v==0 else -.035),.045),point(t,v+(.035 if v==0 else -.035),.045),6)
            for v in [0,1]:quad(point(v,t,.045),point(v,u,.045),point(v+(.025 if v==0 else -.025),u,.045),point(v+(.025 if v==0 else -.025),t,.045),6)

    for side in [-1,1]:
        wing_start=[len(g) for g in groups]
        swept=name not in ['light','turboprop','pc12'];tipx=-sweep*L if swept else -.03*L;wingz=-r*.45 if swept else r*.65
        airfoil(side,tipx,wingz)
        if family not in ['b777','b787','b767','b747','light','turboprop','pc12']:
            foil([(tipx,side*span*.48,1),(tipx-.055*L,side*span*.50,3.2), (tipx-.08*L,side*span*.50,3.0),(tipx-.075*L,side*span*.48,1)],.04,2)
        if name=='b737max':foil([(tipx,side*span*.48,.8),(tipx-.065*L,side*span*.51,-.9),(tipx-.085*L,side*span*.5,-.7),(tipx-.06*L,side*span*.48,.8)],.04,2)
        wing_groups.append([(m,g[wing_start[m]:]) for m,g in enumerate(groups) if len(g)>wing_start[m]])
        for m,g in enumerate(groups):del g[wing_start[m]:]
        tailz=r+L*fin_height*.88 if name in ['bizjet','crj'] else r*1.8 if name=='pc12' else r*.4
        foil([(-.32*L,side*r*.5,tailz),(-.43*L,side*span*.18,tailz+.6),(-.465*L,side*span*.18,tailz+.6),(-.415*L,side*r*.4,tailz)],.08)
        start=[len(g) for g in groups]
        foil([(-.415*L,side*r*.4,tailz),(-.465*L,side*span*.18,tailz+.6),(-.49*L,side*span*.18,tailz+.6),(-.45*L,side*r*.4,tailz)],.06)
        capture_surface('Elevator'+('L' if side<0 else 'R'),'elevator',(-.415*L,0,tailz),0,1,start)
        for e in range(engines//2):
            y=side*span*(.19+e*.13);x=.005*L-e*L*.105;z=-r*1.15;er=r*(.66 if family in ['b777','b787','a350','b737max'] else .54)
            if name in ['bizjet','crj']:x=-L*.29;y=side*r*1.8;z=r*.45;er=r*.48
            if name=='turboprop':er=r*.45;z=r*.3
            if name in ['bizjet','crj']:foil([(x-.03*L,side*r,z),(x+.02*L,side*r,z),(x+.01*L,y,z),(x-.04*L,y,z)],.1,1)
            else:foil([(x-.07*L,y-.14,wingz),(x+.04*L,y-.14,wingz),(x+.02*L,y-.14,z),(x-.07*L,y-.14,z)],.14,1)
            tube([(x-.065*L,er*.67,y,z),(x-.04*L,er*.92,y,z),(x+.045*L,er,y,z),(x+.05*L,er*.94,y,z)],7)
            tube([(x+.051*L,er*.94,y,z),(x+.05*L,er*.80,y,z)],6)
            # A thin nacelle service band follows the engine contour.
            tube([(x-.02*L,er*.981,y,z),(x-.0195*L,er*.982,y,z)],6)
            tube([(x+.049*L,er*.80,y,z),(x+.025*L,er*.75,y,z),(x+.024*L,.001,y,z)],3)
            # Recessed swept fan blades and a rounded spinner, separate from the cowl.
            fan_start=[len(g) for g in groups]
            if name!='turboprop':
                for j in range(28):
                    angle=j*math.tau/28
                    def blade(radius,sweep,depth):return (x+.027*L+depth,y+er*radius*math.cos(angle+sweep),z+er*radius*math.sin(angle+sweep))
                    quad(blade(.20,0,0),blade(.77,.22,-er*.06),blade(.77,.29,-er*.06),blade(.20,.12,0),6)
                tube([(x+.026*L,er*.23,y,z),(x+.04*L,er*.17,y,z),(x+.05*L,.005,y,z)],6)
                fan_groups.append([(m,g[fan_start[m]:]) for m,g in enumerate(groups) if len(g)>fan_start[m]])
                for m,g in enumerate(groups):del g[fan_start[m]:]
                fan_hubs.append([y,z,x+.027*L])
            else:tube([(x+.025*L,er*.2,y,z),(x+.05*L,.005,y,z)],6)
            # Exhaust cone and inner dark nozzle give the rear of each nacelle depth.
            tube([(x-.066*L,er*.64,y,z),(x-.074*L,er*.45,y,z)],6)
            tube([(x-.075*L,er*.43,y,z),(x-.09*L,er*.12,y,z),(x-.094*L,.005,y,z)],3)
            if name=='turboprop':
                for j in range(4):
                    a=j*math.pi/2;dy=math.cos(a);dz=math.sin(a);foil([(x+.06*L,y,z),(x+.06*L,y+dy*2.5,z+dz*2.5),(x+.065*L,y+dy*2.5+.15,z+dz*2.5+.15),(x+.065*L,y+.15,z+.15)],.04,3)
        # Rounded cabin windows conform to the cylindrical fuselage.
        step=.95 if L>25 else .75
        for row in ([.2,.7] if name=='a380' else [.2]):
            x=-L*.23
            while x<L*.29:
                pts=[]
                for j in range(12):
                    a=j*math.tau/12;z=r*row+math.sin(a)*.18;y=side*(math.sqrt(max(.01,r*r-z*z))+.018);pts.append((x+.13*math.cos(a),y,z))
                for j in range(1,11):tri(pts[0],pts[j],pts[j+1],3)
                x+=step
        # Distinct side and forward windshield panes, including private and prop types.
        if name=='b747':
            cockpit_patch(side,.35,.375,15,52);cockpit_patch(side,.38,.404,20,60)
        elif name in ['light','pc12']:
            cockpit_patch(side,.19,.30,12,58);cockpit_patch(side,.305,.39,20,77)
        else:
            cockpit_patch(side,.335,.373,18,49);cockpit_patch(side,.378,.413,22,60);cockpit_patch(side,.418,.443,30,81)
        # Rounded door seals conform to the skin instead of floating flat strips.
        for door_x in [-L*.23,L*.28]:
            h=min(r*.65,.95);w=min(.42,L*.015);cz=r*.05
            def seal(angle,expand):
                xx=door_x+(w+expand)*math.copysign(abs(math.cos(angle))**.35,math.cos(angle));zz=cz+(h+expand)*math.copysign(abs(math.sin(angle))**.35,math.sin(angle))
                return (xx,side*(math.sqrt(max(.01,r*r-zz*zz))+.024),zz)
            for j in range(32):quad(seal(j*math.tau/32,0),seal((j+1)*math.tau/32,0),seal((j+1)*math.tau/32,.015),seal(j*math.tau/32,.015),6)
        # Lower cargo-hold access outline, sized to the airframe (illustrative).
        if L>25:
            for cx in [-L*.15,L*.16]:
                for j in range(32):
                    def cargo(t):
                        xx=cx+L*.026*math.copysign(abs(math.cos(t))**.3,math.cos(t));zz=-r*.48+r*.20*math.copysign(abs(math.sin(t))**.3,math.sin(t))
                        return (xx,side*(math.sqrt(max(.01,r*r-zz*zz))+.032),zz)
                    a=cargo(j*math.tau/32);b=cargo((j+1)*math.tau/32)
                    quad(a,b,(b[0],b[1],b[2]+.018),(a[0],a[1],a[2]+.018),6)
        # Correct-facing logo decals on each side of the fin and forward fuselage.
        def decal(x0,x1,z0,z1,y):
            a=(x0,y,z0);b=(x1,y,z0);c=(x1,y,z1);d=(x0,y,z1)
            uv=[(0,1),(1,1),(1,0),(0,0)] if side<0 else [(1,1),(0,1),(0,0),(1,0)]
            tri(a,b,c,5,uv=uv[:3]);tri(a,c,d,5,uv=[uv[0],uv[2],uv[3]])
        decal(-.448*L,-.406*L,r+L*fin_height*.46,r+L*fin_height*.74,side*.12)
        decal(.19*L,.19*L+r*.85,-r*.42,r*.43,side*(r+.04))
    # A subtle operator-colored lower fuselage stripe; geometry follows the body.
    for side in [-1,1]:
        z0=-r*.60;z1=-r*.49
        y0=side*(math.sqrt(r*r-z0*z0)+.025);y1=side*(math.sqrt(r*r-z1*z1)+.025)
        quad((-.19*L,y0,z0),(.30*L,y0,z0),(.30*L,y1,z1),(-.19*L,y1,z1),7)
    # Solid swept fin, rather than a paper triangle.
    fin=[(-.28*L,r*.65),(-.425*L,r+L*fin_height),(-.448*L,r+L*fin_height),(-.465*L,r*.4)]
    start=[len(g) for g in groups]
    foil([(-.448*L,0,r+L*fin_height),(-.46*L,0,r+L*fin_height),(-.495*L,0,r*.4),(-.465*L,0,r*.4)],.08,2)
    capture_surface('Rudder','rudder',(-.457*L,0,r*.5),1,1,start)
    for side in [-1,1]:
        for i in range(1,len(fin)-1):tri((fin[0][0],side*.1,fin[0][1]),(fin[i][0],side*.1,fin[i][1]),(fin[i+1][0],side*.1,fin[i+1][1]),2)
    for i in range(len(fin)):j=(i+1)%len(fin);quad((fin[i][0],-.1,fin[i][1]),(fin[j][0],-.1,fin[j][1]),(fin[j][0],.1,fin[j][1]),(fin[i][0],.1,fin[i][1]),2)
    if name=='b747':tube([(.01*L,.01,0,r*.68),(.08*L,r*.58,0,r*.68),(.28*L,r*.62,0,r*.68),(.36*L,r*.40,0,r*.6),(.41*L,.01,0,r*.5)])
    if name in ['light','pc12']:tube([(.44*L,.3,0,0),(.51*L,.3,0,0)],3);foil([(.52*L,0,-1.2),(.52*L,.12,-1.2),(.52*L,.12,1.2),(.52*L,0,1.2)],.03,3)
    def box(x,y,z,dx,dy,dz,mat=4):
        a=(x-dx,y-dy,z-dz);b=(x+dx,y-dy,z-dz);c=(x+dx,y+dy,z-dz);d=(x-dx,y+dy,z-dz);e=(x-dx,y-dy,z+dz);f=(x+dx,y-dy,z+dz);g=(x+dx,y+dy,z+dz);h=(x-dx,y+dy,z+dz)
        for q in [(a,b,c,d),(e,f,g,h),(a,b,f,e),(b,c,g,f),(c,d,h,g),(d,a,e,h)]:quad(*q,mat)
    def strut(a,b,radius,mat=6):
        axis=[b[k]-a[k] for k in range(3)];length=math.sqrt(sum(q*q for q in axis));axis=[q/length for q in axis];ref=(0,1,0) if abs(axis[1])<.9 else (1,0,0)
        u=(axis[1]*ref[2]-axis[2]*ref[1],axis[2]*ref[0]-axis[0]*ref[2],axis[0]*ref[1]-axis[1]*ref[0]);mag=math.sqrt(sum(q*q for q in u));u=[q/mag for q in u];v=(axis[1]*u[2]-axis[2]*u[1],axis[2]*u[0]-axis[0]*u[2],axis[0]*u[1]-axis[1]*u[0])
        def point(center,t):return tuple(center[k]+radius*(u[k]*math.cos(t)+v[k]*math.sin(t)) for k in range(3))
        for j in range(16):quad(point(a,j*math.tau/16),point(a,(j+1)*math.tau/16),point(b,(j+1)*math.tau/16),point(b,j*math.tau/16),mat)
    gear_start=[len(g) for g in groups]
    wide=family in ['b767','b777','b787','a330','a350','a380','b747']
    axles=3 if family=='b777' or name=='a35k' else 2 if wide or family=='b757' else 1
    # Each axle has its own local wheel mesh; paired tires rotate about that axle.
    wheel_positions=[(L*.29,0)];wheel_names=['WheelN'];wheel_radii=[.28 if L<20 else .4]
    for axle in range(axles):
        for side,label in [(-1,'L'),(1,'R')]:
            wheel_positions.append((-L*.1+(axle-(axles-1)/2)*1.05,side*r*(1.10 if wide else .8)))
            wheel_names.append('Wheel'+label+(str(axle+1) if axle else ''));wheel_radii.append(.52 if wide else .4 if L>20 else .25)
    if family in ['b747','a380']:
        body_axles=3 if family=='a380' else 2
        for axle in range(body_axles):
            for side,label in [(-1,'L'),(1,'R')]:
                wheel_positions.append((-L*.16+(axle-(body_axles-1)/2)*1.05,side*r*.42));wheel_names.append('WheelB'+label+str(axle));wheel_radii.append(.52)
    groups.extend([] for _ in range(len(wheel_positions)-3))
    for wheel,(x,y) in enumerate(wheel_positions):
        radius=wheel_radii[wheel];paired=L>20;centers=[-.25,.25] if paired else [0]
        strut((x,y,-r*.7),(x,y,-r-1.45),.09)
        strut((x+.4,y,-r*.85),(x,y,-r-1.2),.055)
        strut((x,y-.42,-r-1.6),(x,y+.42,-r-1.6),.09)
        strut((x,y,-r-.6),(x,y,-r-1.2),.12,1)
        if wheel<3:
            # Open gear-bay doors attached to retracting assembly.
            foil([(x-.65,y-.48,-r*.75),(x+.65,y-.48,-r*.75),(x+.65,y-.62,-r-1),(x-.65,y-.62,-r-1)],.025,0)
        hubs=[]
        for center in centers:
            for j in range(32):
                a=j*math.tau/32;b=(j+1)*math.tau/32
                profile=[(-.16,.55),(-.155,.78),(-.12,.95),(-.08,1),(.08,1),(.12,.95),(.155,.78),(.16,.55)]
                for (yy,rr),(yyy,rrr) in zip(profile,profile[1:]):
                    rr*=radius;rrr*=radius
                    quad((rr*math.cos(a),yy+center,rr*math.sin(a)),(rr*math.cos(b),yy+center,rr*math.sin(b)),(rrr*math.cos(b),yyy+center,rrr*math.sin(b)),(rrr*math.cos(a),yyy+center,rrr*math.sin(a)),8+wheel)
                start=len(groups[6])
                for yy in [-.161,.161]:tri((0,yy+center,0),(.55*radius*math.cos(a),yy+center,.55*radius*math.sin(a)),(.55*radius*math.cos(b),yy+center,.55*radius*math.sin(b)),6)
                hubs.extend(groups[6][start:]);del groups[6][start:]
        wheel_hubs.append(hubs)
    gear_groups=[(m,g[gear_start[m]:]) for m,g in enumerate(groups[:8]) if len(g)>gear_start[m]]
    for m,g in enumerate(groups[:8]):del g[gear_start[m]:]
    # Merge each moving surface by material to keep draw calls bounded.
    for key,parts in surface_groups.items():
        merged={}
        for material,vertices in parts:merged.setdefault(material,[]).extend(vertices)
        surface_groups[key]=list(merged.items())
    blob=bytearray();views=[];access=[];prims=[]
    for mat,items,wing in [(m,g,None) for m,g in enumerate(groups)]+[(m,g,side) for side,parts in enumerate(wing_groups) for m,g in parts]+[(m,g,100+i) for i,parts in enumerate(fan_groups) for m,g in parts]+[(m,g,-1) for m,g in gear_groups]+[(m,g,200+i) for i,parts in enumerate(surface_groups.values()) for m,g in parts]+[(6,g,300+i) for i,g in enumerate(wheel_hubs)]:
        if not items:continue
        # Weld repeated triangle corners; keep prop/window geometry unindexed
        # because the existing propeller-rig preparation splits those triangles.
        indices=[]
        if mat!=3:
            unique={};compact=[]
            for vertex in items:
                key=tuple(round(n,6) for part in vertex for n in part)
                if key not in unique:unique[key]=len(compact);compact.append(vertex)
                indices.append(unique[key])
            items=compact
        attrs={}
        for key,idx in [('POSITION',0),('NORMAL',1),('TEXCOORD_0',2)]:
            if key=='TEXCOORD_0' and mat not in [0,5]:continue
            rows=[v[idx] for v in items];rows=rows if idx==2 else [(y,z,x) for x,y,z in rows];dim=len(rows[0]);raw=b''.join(struct.pack('<'+'f'*dim,*v) for v in rows)
            views.append({'buffer':0,'byteOffset':len(blob),'byteLength':len(raw),'target':34962});blob.extend(raw);acc={'bufferView':len(views)-1,'componentType':5126,'count':len(rows),'type':'VEC'+str(dim)}
            if key=='POSITION':acc.update(min=[min(v[i] for v in rows) for i in range(3)],max=[max(v[i] for v in rows) for i in range(3)])
            access.append(acc);attrs[key]=len(access)-1
        indexed={}
        if indices:
            raw=struct.pack('<'+'I'*len(indices),*indices);views.append({'buffer':0,'byteOffset':len(blob),'byteLength':len(raw),'target':34963});blob.extend(raw);access.append({'bufferView':len(views)-1,'componentType':5125,'count':len(indices),'type':'SCALAR'});indexed={'indices':len(access)-1}
        prims.append({**indexed,'attributes':attrs,'material':min(mat,4) if mat>=8 else mat,**({'extras':{'gear':True} if wing==-1 else {'wheel':wing-300} if wing>=300 else {'surface':wing-200} if wing>=200 else {'fan':wing-100} if wing>=100 else {'wing':wing}} if wing is not None else {'extras':{'wheel':mat-8}} if mat>=8 else {})})
    (out/(name+'-v4.bin')).write_bytes(blob)
    for airline,color in paints.items():
        rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)];body=[.94,.95,.96] if airline!='SWA' else [.03,.16,.6]
        materials=[{'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':c+[1],'metallicFactor':.04 if i in [0,1,2,7] else .8 if i==6 else 0,'roughnessFactor':.27 if i in [0,2,7] else .4 if i==1 else .12 if i==3 else .86 if i==4 else .28}} for i,c in enumerate([body,[.64,.68,.72],rgb,[.02,.055,.085],[.07,.08,.09],[1,1,1],[.36,.4,.44],rgb if airline!='neutral' else body])]
        materials[5].update(alphaMode='MASK',alphaCutoff=.08);materials[5]['pbrMetallicRoughness'].update(metallicFactor=0,roughnessFactor=.75,baseColorTexture={'index':0})
        main=[q for q in prims if 'wing' not in q.get('extras',{}) and 'fan' not in q.get('extras',{}) and 'gear' not in q.get('extras',{}) and 'surface' not in q.get('extras',{}) and 'wheel' not in q.get('extras',{}) and q['material']!=4 and (airline!='neutral' or q['material']!=5)]
        g={'asset':{'version':'2.0','generator':'Skyward detailed procedural '+name+' fallback v6; approximate airframe; operator identification logos'},'scene':0,'scenes':[{'nodes':[0,1]}],'nodes':[{'mesh':0},{'mesh':1,'name':'Gear','children':list(range(2,2+len(wheel_positions)))}]+[{'mesh':2+i,'name':wheel_names[i],'translation':[y,-r-1.6,x]} for i,(x,y) in enumerate(wheel_positions)],'meshes':[{'name':'AirframeWithCockpitGlazing','primitives':main},{'primitives':[q for q in prims if q.get('extras',{}).get('gear') or q['material']==4 and 'extras' not in q]}]+[{'primitives':[q for q in prims if q.get('extras',{}).get('wheel')==i]} for i in range(len(wheel_positions))],'materials':materials,'buffers':[{'uri':name+'-v4.bin?tail=2&rig=1&detail=6','byteLength':len(blob)}],'bufferViews':views,'accessors':access}
        for i,key in enumerate(surface_groups):
            node=len(g['nodes']);mesh=len(g['meshes']);g['scenes'][0]['nodes'].append(node);g['nodes'].append({'mesh':mesh,'name':key});g['meshes'].append({'primitives':[q for q in prims if q.get('extras',{}).get('surface')==i]})
        for side in range(2):
            node=len(g['nodes']);mesh=len(g['meshes']);g['scenes'][0]['nodes'].append(node);g['nodes'].append({'mesh':mesh,'name':['FlexWingL','FlexWingR'][side]});g['meshes'].append({'primitives':[q for q in prims if q.get('extras',{}).get('wing')==side]})
        for i in range(len(fan_groups)):
            node=len(g['nodes']);mesh=len(g['meshes']);g['scenes'][0]['nodes'].append(node);g['nodes'].append({'mesh':mesh,'name':f'SkywardFan{i}'});g['meshes'].append({'primitives':[q for q in prims if q.get('extras',{}).get('fan')==i]})
        if airline!='neutral':g.update(images=[{'uri':'../../airlines/'+airline+'.png'}],textures=[{'source':0,'sampler':0}],samplers=[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}])
        else:materials[5]['pbrMetallicRoughness'].pop('baseColorTexture')
        g.setdefault('images',[]);g.setdefault('textures',[]);g.setdefault('samplers',[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]);texture=len(g['textures']);g['textures'].append({'source':len(g['images']),'sampler':0});g['images'].append({'uri':'fallback-paint-v5.png'});materials[0]['pbrMetallicRoughness']['baseColorTexture']={'index':texture}
        (out/(name+'-'+airline+'-v4.gltf')).write_text(json.dumps(g,separators=(',',':')))
    detail_rigs[name]={'surfaces':surface_specs,'wheels':[{'name':n,'radius':radius} for n,radius in zip(wheel_names,wheel_radii)]}
    fan_rigs['fleet:'+name]={'groups':[{'nodes':[f'SkywardFan{i}'],'axis':2,'pivot':hub,'kind':'fan'} for i,hub in enumerate(fan_hubs)],'hide':[]}
    template=json.loads((out/(name+'-THY-v4.gltf')).read_text())
    for path in out.glob(name+'-*-v4.gltf'):
        if path.name==name+'-neutral-v4.gltf':continue
        existing=json.loads(path.read_text())
        for key in ['scene','scenes','nodes','meshes','buffers','bufferViews','accessors']:existing[key]=template[key]
        path.write_text(json.dumps(existing,separators=(',',':')))
rig_path=out.parents[2]/'src/lib/fallbackFanRigs.json'
previous=json.loads(rig_path.read_text()) if rig_path.exists() else {}
previous.update(fan_rigs);rig_path.write_text(json.dumps(previous,separators=(',',':')))
print('Generated',1 if args.profile else len(profiles),'enhanced profiles with shared buffers and operator decals.')

detail_path=rig_path.with_name('fallbackDetailRigs.json');previous=json.loads(detail_path.read_text()) if detail_path.exists() else {};previous.update(detail_rigs);detail_path.write_text(json.dumps(previous,separators=(',',':')))
