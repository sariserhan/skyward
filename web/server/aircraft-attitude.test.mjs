import test from 'node:test';
import assert from 'node:assert/strict';
import {Cartesian3,Matrix3,Matrix4,Transforms,Quaternion,HeadingPitchRoll} from 'cesium';
import {aircraftModelAttitude,aircraftBankRadians} from '../src/lib/aircraftAttitude.ts';
import {AircraftAnimation} from '../src/lib/aircraftAnimation.ts';
import {initialFlight,stepFlight,headingError} from '../src/lib/flightSimulator.ts';

function bodyAxes(heading,pitch,bank,lat=38,lon=-77){
 const position=Cartesian3.fromDegrees(lon,lat,10000),attitude=Transforms.headingPitchRollQuaternion(position,new HeadingPitchRoll(...aircraftModelAttitude(heading,pitch,bank))),rotation=Matrix3.fromQuaternion(attitude),enuInverse=Matrix4.inverseTransformation(Transforms.eastNorthUpToFixedFrame(position),new Matrix4());
 const local=v=>Matrix4.multiplyByPointAsVector(enuInverse,Matrix3.multiplyByVector(rotation,v,new Cartesian3()),new Cartesian3());
 return {nose:local(Cartesian3.UNIT_X),left:local(Cartesian3.UNIT_Y),right:local(new Cartesian3(0,-1,0))};
}
test('Cesium model tilts the inside wing down in both directions without changing nose heading',()=>{
 for(const heading of [0,90,180,270,359])for(const bank of [-30,30])for(const lat of [-60,0,60]){
  const axes=bodyAxes(heading,0,bank,lat,179.9);
  assert.ok(bank>0?axes.right.z<0&&axes.left.z>0:axes.left.z<0&&axes.right.z>0,`${heading} / ${bank}: inside wing must drop`);
  const rendered=(Math.atan2(axes.nose.x,axes.nose.y)*180/Math.PI+360)%360;assert.ok(Math.abs(headingError(rendered,heading))<1e-7);assert.ok(Math.abs(axes.nose.z)<1e-7);
 }
 assert.ok(bodyAxes(90,10,25).nose.z>0,'Nose-up pitch remains nose-up');
});
test('Observed heading changes including north crossing bank the model into the turn',()=>{
 for(const [from,to]of [[359,1],[1,359],[80,82],[82,80]]){
  const animation=new AircraftAnimation(),key={},base={heading:from,ground:false,groundSpeed:220,altitude:10000};animation.sample(key,base,0);const {bank}=animation.sample(key,{...base,heading:to},1000),rightTurn=headingError(to,from)>0,axes=bodyAxes(to,0,bank);
  assert.equal(bank>0,rightTurn);assert.ok(rightTurn?axes.right.z<0:axes.left.z<0);
 }
});
test('Simulator controls, heading change, model roll and cockpit camera use the same bank direction',()=>{
 const runway={id:'01',a:[-77,38],b:[-77,38.03],length:3300,width:50},plan={from:'IAD',to:'DCA',departure:runway,arrival:runway,aircraftType:'B738',difficulty:'advanced',challenge:'calm'};
 for(const input of [-1,1]){
  const initial={...initialFlight(plan),ground:false,phase:'cruise',altitude:10000,speed:220,enginePower:.5,throttle:.5,heading:0},s=stepFlight(initial,plan,{roll:input,pitch:0,rudder:0},1);
  assert.equal(Math.sign(headingError(s.heading,initial.heading)),input);const axes=bodyAxes(s.heading,s.pitch,s.bank);assert.ok(input>0?axes.right.z<0:axes.left.z<0);
  // This is Cesium Camera.setView's actual direction/up/right convention.
  const matrix=Matrix3.fromQuaternion(Quaternion.fromHeadingPitchRoll(new HeadingPitchRoll((s.heading-90)*Math.PI/180,0,aircraftBankRadians(s.bank)))),direction=Matrix3.getColumn(matrix,0,new Cartesian3()),up=Matrix3.getColumn(matrix,2,new Cartesian3()),right=Cartesian3.cross(direction,up,new Cartesian3());
  assert.ok(input>0?right.z<0:right.z>0,'Cockpit must roll with the aircraft');
 }
});
