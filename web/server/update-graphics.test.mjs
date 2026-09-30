import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from 'cesium';
import {updateGraphics} from '../src/lib/updateGraphics.ts';
test('unchanged marker updates preserve graphics properties and emit no changes',()=>{
 globalThis.window={Cesium:C};try{
  for(const graphics of [new C.BillboardGraphics(),new C.LabelGraphics(),new C.PointGraphics(),new C.ModelGraphics()]){
   updateGraphics(graphics,{show:true,distanceDisplayCondition:new C.DistanceDisplayCondition(20,5000)});
   const property=graphics.distanceDisplayCondition;let changes=0;graphics.definitionChanged.addEventListener(()=>changes++);
   for(let i=0;i<100;i++)updateGraphics(graphics,{show:true,distanceDisplayCondition:new C.DistanceDisplayCondition(20,5000)});
   assert.equal(changes,0);assert.equal(graphics.distanceDisplayCondition,property);
   updateGraphics(graphics,{show:false,distanceDisplayCondition:undefined});assert.equal(graphics.show.getValue(),false);assert.equal(graphics.distanceDisplayCondition,undefined);assert.equal(changes,2);
  }
 }finally{delete globalThis.window;}
});
test('changed marker colors and label text update without replacing their properties',()=>{
 globalThis.window={Cesium:C};try{const label=new C.LabelGraphics();updateGraphics(label,{text:'OLD',fillColor:C.Color.RED});const text=label.text,color=label.fillColor;updateGraphics(label,{text:'NEW',fillColor:C.Color.GREEN});assert.equal(label.text,text);assert.equal(label.fillColor,color);assert.equal(text.getValue(),'NEW');assert.ok(C.Color.equals(color.getValue(),C.Color.GREEN));}finally{delete globalThis.window;}
});
