"""Original illustrative aircraft geometry; locally sourced logos identify operators.
Coordinates: X nose, Y lateral, Z up; glTF +Z forward, +Y up.
"""
import json, math, struct, argparse
parser=argparse.ArgumentParser();parser.add_argument("--profile");args=parser.parse_args()
from pathlib import Path
out=Path(__file__).resolve().parents[1]/'public/models/fleet';out.mkdir(parents=True,exist_ok=True)
profiles={'a319':(34,34,4,2),'a320':(38,35,4,2),'a321':(45,36,4,2),'a220':(38,35,3.5,2),'b737':(40,35,3.8,2),'b737max':(40,36,3.8,2),'b757':(47,38,3.8,2),'b767':(55,48,5,2),'b777':(74,65,6.2,2),'b787':(63,60,5.8,2),'a330':(64,60,5.6,2),'a350':(67,65,6,2),'a380':(73,80,8,4),'b747':(71,65,6.5,4),'regional':(32,27,3,2),'bizjet':(22,21,2.5,2),'turboprop':(23,26,2.8,2),'light':(9,11,1.4,1),'generic':(40,36,4,2)}
paints={'neutral':'70899c','THY':'c81932','UAL':'2266bd','AAL':'397daf','DAL':'b71b39','BAW':'263f81','DLH':'173c72','AFR':'263d7e','KLM':'23a5d5','QTR':'721e49','UAE':'ca2635','PGT':'e5b620','SWA':'254cc2','JBU':'193979','ETH':'258b50','SAS':'234d9b'}
profiles.update({'b772':(64,61,6.2,2),'b788':(57,60,5.8,2),'b78x':(68,60,5.8,2),'a35k':(74,65,6,2),'e190':(36,29,3,2),'crj':(36,25,2.7,2),'pc12':(14,16,1.5,1)})
paints.update({'RYR': '16457c', 'EZY': 'f16b22', 'WZZ': 'c5197b', 'SIA': '172f5c', 'CPA': '126259', 'ANA': '234d9b', 'JAL': 'c81932', 'QFA': 'cb2033', 'ACA': 'b51c30'})
for name,(L,span,dia,engines) in profiles.items():
    if args.profile and name!=args.profile:continue
    family={'b772':'b777','b788':'b787','b78x':'b787','a35k':'a350'}.get(name,name)
    r=dia/2;groups=[[] for _ in range(11)];wing_groups=[]
    def tri(a,b,c,mat=0,normals=None,uv=None):
        u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)];n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];d=math.sqrt(sum(x*x for x in n)) or 1;n=tuple(x/d for x in n)
        for i,p in enumerate([a,b,c]):groups[mat].append((p,normals[i] if normals else n,uv[i] if uv else (0,0)))
    def quad(a,b,c,d,mat=0):tri(a,b,c,mat);tri(a,c,d,mat)
    def tube(rings,mat=0,ellipse=1):
        for (x,rad,y,z),(xx,rr,yy,zz) in zip(rings,rings[1:]):
            slope=(rad-rr)/max(.0001,xx-x) if xx>x else (rad-rr)/min(-.0001,xx-x)
            def n(t):
                a=(slope,math.cos(t),math.sin(t)/ellipse);d=math.sqrt(sum(k*k for k in a));return tuple(k/d for k in a)
            for j in range(48):
                t=j*math.tau/48;u=(j+1)*math.tau/48
                a=(x,y+rad*math.cos(t),z+ellipse*rad*math.sin(t));b=(x,y+rad*math.cos(u),z+ellipse*rad*math.sin(u));c=(xx,yy+rr*math.cos(u),zz+ellipse*rr*math.sin(u));d=(xx,yy+rr*math.cos(t),zz+ellipse*rr*math.sin(t))
                tri(a,b,c,mat,[n(t),n(u),n(u)]);tri(a,c,d,mat,[n(t),n(u),n(t)])
    def foil(points,thick=.10,mat=1):
        top=[(x,y,z+thick) for x,y,z in points];bottom=[(x,y,z-thick) for x,y,z in points]
        for i in range(1,len(points)-1):tri(top[0],top[i],top[i+1],mat);tri(bottom[0],bottom[i+1],bottom[i],mat)
        for i in range(len(points)):j=(i+1)%len(points);quad(top[i],bottom[i],bottom[j],top[j],mat)
    nose=[(.34,1),(.39,.91),(.44,.68),(.477,.38),(.5,.01)] if name.startswith('a') else [(.31,1),(.37,.96),(.425,.76),(.47,.39),(.5,.01)]
    tube([(x*L,rr*r,0,0) for x,rr in [(-.5,.015),(-.47,.22),(-.42,.48),(-.35,.8),(-.27,.98),(-.19,1)]+nose],ellipse=1.18 if name=='a380' else 1)
    for side in [-1,1]:
        wing_start=[len(g) for g in groups]
        swept=name not in ['light','turboprop','pc12'];tipx=-.19*L if swept else -.03*L;wingz=-r*.45 if swept else r*.65
        foil([(.1*L,side*r*.75,wingz),(tipx,side*span*.45,.7),(tipx-.015*L,side*span*.5,1.4 if family in ['b787','a350'] else .9),(tipx-.07*L,side*span*.5,.9),(-.17*L,side*r,wingz)],.12)
        if family not in ['b777','b787','b767','b747','light','turboprop','pc12']:
            foil([(tipx,side*span*.48,1),(tipx-.055*L,side*span*.50,3.2), (tipx-.08*L,side*span*.50,3.0),(tipx-.075*L,side*span*.48,1)],.04,2)
        if name=='b737max':foil([(tipx,side*span*.48,.8),(tipx-.065*L,side*span*.51,-.9),(tipx-.085*L,side*span*.5,-.7),(tipx-.06*L,side*span*.48,.8)],.04,2)
        wing_groups.append([(m,g[wing_start[m]:]) for m,g in enumerate(groups) if len(g)>wing_start[m]])
        for m,g in enumerate(groups):del g[wing_start[m]:]
        tailz=r*1.8 if name in ['bizjet','crj','pc12'] else r*.4
        foil([(-.32*L,side*r*.5,tailz),(-.43*L,side*span*.18,tailz+.6),(-.49*L,side*span*.18,tailz+.6),(-.45*L,side*r*.4,tailz)],.08)
        for e in range(engines//2):
            y=side*span*(.19+e*.13);x=.005*L-e*L*.105;z=-r*1.15;er=r*(.66 if family in ['b777','b787','a350','b737max'] else .54)
            if name in ['bizjet','crj']:x=-L*.29;y=side*r*1.8;z=r*.45;er=r*.48
            if name=='turboprop':er=r*.45;z=r*.3
            foil([(x-.07*L,y-.14,-r*.4),(x+.04*L,y-.14,-r*.4),(x+.02*L,y-.14,z),(x-.07*L,y-.14,z)],.14,1)
            tube([(x-.065*L,er*.67,y,z),(x-.04*L,er*.92,y,z),(x+.045*L,er,y,z),(x+.05*L,er*.94,y,z)],7)
            tube([(x+.051*L,er*.94,y,z),(x+.05*L,er*.80,y,z)],6)
            tube([(x+.049*L,er*.80,y,z),(x+.025*L,er*.75,y,z),(x+.024*L,.001,y,z)],3)
            for j in range(16):
                a=j*math.tau/16;b=a+.15
                tri((x+.026*L,y,z),(x+.026*L,y+er*.74*math.cos(a),z+er*.74*math.sin(a)),(x+.026*L,y+er*.74*math.cos(b),z+er*.74*math.sin(b)),6)
            tube([(x+.025*L,er*.2,y,z),(x+.05*L,.005,y,z)],6)
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
        # Cockpit panels follow the nose surface rather than protruding like blocks.
        quad((.35*L,side*r*.84,r*.38),(.415*L,side*r*.65,r*.35),(.399*L,side*r*.59,r*.63),(.35*L,side*r*.71,r*.67),3)
        # Paired exit outlines, curved to the fuselage.
        for x in [-L*.23,L*.28]:
            z0=-r*.3;z1=r*.6;y=side*(r+.025)
            quad((x,y,z0),(x+.05,y,z0),(x+.05,y,z1),(x,y,z1),6)
        # Correct-facing logo decals on each side of the fin and forward fuselage.
        def decal(x0,x1,z0,z1,y):
            a=(x0,y,z0);b=(x1,y,z0);c=(x1,y,z1);d=(x0,y,z1)
            uv=[(0,1),(1,1),(1,0),(0,0)] if side<0 else [(1,1),(0,1),(0,0),(1,0)]
            tri(a,b,c,5,uv=uv[:3]);tri(a,c,d,5,uv=[uv[0],uv[2],uv[3]])
        decal(-.448*L,-.406*L,r+L*.069,r+L*.111,side*.12)
        decal(.19*L,.19*L+r*.85,-r*.42,r*.43,side*(r+.04))
    # A subtle operator-colored lower fuselage stripe; geometry follows the body.
    for side in [-1,1]:
        z0=-r*.60;z1=-r*.49
        y0=side*(math.sqrt(r*r-z0*z0)+.025);y1=side*(math.sqrt(r*r-z1*z1)+.025)
        quad((-.19*L,y0,z0),(.30*L,y0,z0),(.30*L,y1,z1),(-.19*L,y1,z1),7)
    # Solid swept fin, rather than a paper triangle.
    fin=[(-.28*L,r*.65),(-.425*L,r+L*.145),(-.46*L,r+L*.145),(-.495*L,r*.4)]
    for side in [-1,1]:
        for i in range(1,len(fin)-1):tri((fin[0][0],side*.1,fin[0][1]),(fin[i][0],side*.1,fin[i][1]),(fin[i+1][0],side*.1,fin[i+1][1]),2)
    for i in range(len(fin)):j=(i+1)%len(fin);quad((fin[i][0],-.1,fin[i][1]),(fin[j][0],-.1,fin[j][1]),(fin[j][0],.1,fin[j][1]),(fin[i][0],.1,fin[i][1]),2)
    if name=='b747':tube([(.01*L,.01,0,r*.68),(.08*L,r*.58,0,r*.68),(.28*L,r*.62,0,r*.68),(.36*L,r*.40,0,r*.6),(.41*L,.01,0,r*.5)])
    if name in ['light','pc12']:tube([(.44*L,.3,0,0),(.51*L,.3,0,0)],3);foil([(.52*L,0,-1.2),(.52*L,.12,-1.2),(.52*L,.12,1.2),(.52*L,0,1.2)],.03,3)
    def box(x,y,z,dx,dy,dz,mat=4):
        a=(x-dx,y-dy,z-dz);b=(x+dx,y-dy,z-dz);c=(x+dx,y+dy,z-dz);d=(x-dx,y+dy,z-dz);e=(x-dx,y-dy,z+dz);f=(x+dx,y-dy,z+dz);g=(x+dx,y+dy,z+dz);h=(x-dx,y+dy,z+dz)
        for q in [(a,b,c,d),(e,f,g,h),(a,b,f,e),(b,c,g,f),(c,d,h,g),(d,a,e,h)]:quad(*q,mat)
    wheel_positions=[(L*.29,0),(-L*.1,-r*.8),(-L*.1,r*.8)]
    for wheel,(x,y) in enumerate(wheel_positions):
        box(x,y,-r-.8,.10,.10,.8)
        # Tires are separate meshes centered on their axle, with a faceted tread.
        for j in range(32):
            a=j*math.tau/32;b=(j+1)*math.tau/32;radius=.4 if j%2 else .385
            points=[(radius*math.cos(t),yy,radius*math.sin(t)) for t,yy in [(a,-.25),(b,-.25),(b,.25),(a,.25)]]
            quad(*points,8+wheel)
            for yy in [-.25,.25]:tri((0,yy,0),(radius*math.cos(a),yy,radius*math.sin(a)),(radius*math.cos(b),yy,radius*math.sin(b)),8+wheel)
    blob=bytearray();views=[];access=[];prims=[]
    for mat,items,wing in [(m,g,None) for m,g in enumerate(groups)]+[(m,g,side) for side,parts in enumerate(wing_groups) for m,g in parts]:
        if not items:continue
        attrs={}
        for key,idx in [('POSITION',0),('NORMAL',1),('TEXCOORD_0',2)]:
            if key=='TEXCOORD_0' and mat!=5:continue
            rows=[v[idx] for v in items];rows=rows if idx==2 else [(y,z,x) for x,y,z in rows];dim=len(rows[0]);raw=b''.join(struct.pack('<'+'f'*dim,*v) for v in rows)
            views.append({'buffer':0,'byteOffset':len(blob),'byteLength':len(raw),'target':34962});blob.extend(raw);acc={'bufferView':len(views)-1,'componentType':5126,'count':len(rows),'type':'VEC'+str(dim)}
            if key=='POSITION':acc.update(min=[min(v[i] for v in rows) for i in range(3)],max=[max(v[i] for v in rows) for i in range(3)])
            access.append(acc);attrs[key]=len(access)-1
        prims.append({'attributes':attrs,'material':min(mat,4) if mat>=8 else mat,**({'extras':{'wing':wing}} if wing is not None else {'extras':{'wheel':mat-8}} if mat>=8 else {})})
    (out/(name+'-v4.bin')).write_bytes(blob)
    for airline,color in paints.items():
        rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)];body=[.94,.95,.96] if airline!='SWA' else [.03,.16,.6]
        materials=[{'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':c+[1],'metallicFactor':.18 if i!=6 else .7,'roughnessFactor':.3 if i!=3 else .17}} for i,c in enumerate([body,[.64,.68,.72],rgb,[.02,.055,.085],[.07,.08,.09],[1,1,1],[.36,.4,.44],rgb if airline!='neutral' else body])]
        materials[5].update(alphaMode='MASK',alphaCutoff=.08);materials[5]['pbrMetallicRoughness'].update(metallicFactor=0,roughnessFactor=.75,baseColorTexture={'index':0})
        main=[q for q in prims if 'wing' not in q.get('extras',{}) and q['material']!=4 and (airline!='neutral' or q['material']!=5)]
        g={'asset':{'version':'2.0','generator':'Skyward original illustrative '+name+' profile; logos for operator identification'},'scene':0,'scenes':[{'nodes':[0,1]}],'nodes':[{'mesh':0},{'mesh':1,'name':'Gear','children':[2,3,4]}]+[{'mesh':2+i,'name':['WheelN','WheelL','WheelR'][i],'translation':[y,-r-1.6,x]} for i,(x,y) in enumerate(wheel_positions)],'meshes':[{'primitives':main},{'primitives':[q for q in prims if q['material']==4 and 'extras' not in q]}]+[{'primitives':[q for q in prims if q.get('extras',{}).get('wheel')==i]} for i in range(3)],'materials':materials,'buffers':[{'uri':name+'-v4.bin?tail=2&rig=1','byteLength':len(blob)}],'bufferViews':views,'accessors':access}
        for side in range(2):
            node=len(g['nodes']);mesh=len(g['meshes']);g['scenes'][0]['nodes'].append(node);g['nodes'].append({'mesh':mesh,'name':['FlexWingL','FlexWingR'][side]});g['meshes'].append({'primitives':[q for q in prims if q.get('extras',{}).get('wing')==side]})
        if airline!='neutral':g.update(images=[{'uri':'../../airlines/'+airline+'.png'}],textures=[{'source':0,'sampler':0}],samplers=[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}])
        else:materials[5]['pbrMetallicRoughness'].pop('baseColorTexture')
        (out/(name+'-'+airline+'-v4.gltf')).write_text(json.dumps(g,separators=(',',':')))
    template=json.loads((out/(name+'-THY-v4.gltf')).read_text())
    for path in out.glob(name+'-*-v4.gltf'):
        if path.name==name+'-neutral-v4.gltf':continue
        existing=json.loads(path.read_text())
        for key in ['scene','scenes','nodes','meshes','buffers','bufferViews','accessors']:existing[key]=template[key]
        path.write_text(json.dumps(existing,separators=(',',':')))
print('Generated',1 if args.profile else len(profiles),'enhanced profiles with shared buffers and operator decals.')
