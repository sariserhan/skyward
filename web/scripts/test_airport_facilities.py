import unittest,math,json,tempfile,importlib.util
from pathlib import Path
from unittest.mock import patch
from shapely.geometry import Polygon
from airport_facilities import polygons,boundary_for,convert,fallback_boundary

def geom(points):return [{'lon':x,'lat':y} for x,y in points]
def way(i,points,tags=None):return {'type':'way','id':i,'tags':tags or {'building':'yes'},'geometry':geom(points)}
def square(x,y,size):return [(x,y),(x+size,y),(x+size,y+size),(x,y+size),(x,y)]
class Facilities(unittest.TestCase):
 def setUp(self):self.boundary={'shape':Polygon(square(0,0,10)),'method':'icao','osmId':'way/100'}
 def test_split_relation_holes_and_multiple_outers(self):
  outer=square(1,1,4);inner=square(2,2,1)
  rel={'type':'relation','id':10,'tags':{'aeroway':'terminal','type':'multipolygon'},'members':[
   {'type':'way','ref':1,'role':'outer','geometry':geom(outer[:3])},
   {'type':'way','ref':2,'role':'outer','geometry':geom(list(reversed(outer[2:])))},
   {'type':'way','ref':3,'role':'inner','geometry':geom(inner)},
   {'type':'way','ref':4,'role':'outer','geometry':geom(square(6,1,1))}]}
  parts=polygons(rel);self.assertEqual(len(parts),2);self.assertEqual(sum(len(p.interiors) for p in parts),1)
  result,audit=convert([rel,way(3,inner)],self.boundary)
  self.assertEqual(len(result['surfaces']),2);self.assertEqual(audit['duplicatesOmitted'],1);self.assertEqual(audit['courtyards'],1)
 def test_invalid_open_self_intersection_nan_and_missing_member(self):
  for pts in [[(1,1),(2,1),(2,2)],[(1,1),(3,3),(1,3),(3,1),(1,1)],[(1,1),(math.nan,1),(2,2),(1,1)]]:
   with self.assertRaises(ValueError):polygons(way(1,pts))
  with self.assertRaises(ValueError):polygons({'type':'relation','id':1,'members':[{'type':'way','ref':1,'role':'outer','geometry':geom([(1,1),(2,2)])}]})
 def test_matching_prefers_identifier_and_rejects_wrong_airport(self):
  a={'lat':.05,'lon':.05,'icao':'TEST','iata':'TST'}
  wrong=way(1,square(0,0,.1),{'aeroway':'aerodrome','icao':'WRNG'})
  exact=way(2,square(0,0,.2),{'aeroway':'aerodrome','iata':'TST'})
  self.assertIsNone(boundary_for(a,[wrong]));self.assertEqual(boundary_for(a,[wrong,exact])['method'],'iata')
 def test_fallback_excludes_generic_buildings_and_remote_gates(self):
  b={**self.boundary,'method':'bounded_aviation_fallback'}
  rows=[way(1,square(1,1,1)),way(2,square(3,1,1),{'aeroway':'terminal'}),{'type':'node','id':3,'lat':50,'lon':50,'tags':{'aeroway':'gate'}}]
  result,_=convert(rows,b);self.assertEqual(len(result['surfaces']),1);self.assertEqual(result['gates'],[])
 def test_gate_duplicates_and_path_boundary_checks(self):
  gate={'type':'node','id':1,'lat':1,'lon':1,'tags':{'aeroway':'gate','ref':'A1'}}
  result,audit=convert([gate,{**gate,'id':2},way(3,[(1,1),(11,1)],{'aeroway':'taxiway'}),way(4,[(1,1),(2,1)],{'aeroway':'taxiway'})],self.boundary)
  self.assertEqual(len(result['gates']),1);self.assertEqual(len(result['paths']),1);self.assertEqual(audit['rejected']['path_crosses_airport_boundary'],1)
 def test_sparse_snapshot_retains_published_map(self):
  spec=importlib.util.spec_from_file_location('importer',Path(__file__).with_name('import-airport-facilities.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  original={'surfaces':[{}]*10,'gates':[{}]*10,'paths':[]};status={}
  with patch.object(m,'atomic') as write:
   m.publish('TEST',[],{'retrievedAt':'2026-01-01'},self.boundary,{'TEST':original},status,None)
   write.assert_not_called()
  self.assertEqual(status['TEST']['status'],'review_required');self.assertEqual(len(original['gates']),10)
 def test_provider_rate_limit_stops_without_retrying(self):
  from types import SimpleNamespace
  import urllib.error
  spec=importlib.util.spec_from_file_location('importer',Path(__file__).with_name('import-airport-facilities.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  args=SimpleNamespace(retries=2,max_requests=10,max_mb=10,delay=0,endpoint='https://example.invalid')
  with patch.object(m.urllib.request,'urlopen',side_effect=urllib.error.HTTPError(args.endpoint,429,'limited',{},None)) as call:
   with self.assertRaises(m.RateLimited):m.Client(args).query('test')
   self.assertEqual(call.call_count,1)
 def test_incomplete_response_is_not_accepted(self):
  from types import SimpleNamespace
  from io import BytesIO
  spec=importlib.util.spec_from_file_location('importer',Path(__file__).with_name('import-airport-facilities.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  args=SimpleNamespace(retries=0,max_requests=10,max_mb=10,delay=0,endpoint='https://example.invalid')
  response=BytesIO(b'{"elements":[],"remark":"runtime error: timeout"}');response.headers={}
  with patch.object(m.urllib.request,'urlopen',return_value=response):
   with self.assertRaisesRegex(ValueError,'Incomplete'):m.Client(args).query('test')
if __name__=='__main__':unittest.main()
