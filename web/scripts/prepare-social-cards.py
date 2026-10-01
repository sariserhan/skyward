"""Regenerate checked-in static social PNGs using Playwright (maintainer tooling only).
Run after catalog changes; production serves files with no image-generation Worker.
"""
import json,subprocess,html
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
code="""import {airframePaths,airframePage,airframeSocialPath} from './server/airframe-pages.mjs';console.log(JSON.stringify(airframePaths().map(p=>airframePage(p)).filter(p=>!p.privatePage&&!p.redirect).map(p=>({...p,image:airframeSocialPath(p.path)}))));"""
rows=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=ROOT))
expected={Path(r['image']).name for r in rows}
for stale in (ROOT/'public/social').glob('*.png'):
 if stale.name not in expected:stale.unlink()
logo=(ROOT/'public/brand-orbit.svg').read_text()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1200,'height':630},device_scale_factor=1)
 for row in rows:
  title=html.escape(row['title']);description=html.escape(row.get('socialDescription') or row['description']);url='skyvvard.com'+row['path']
  page.set_content(f'''<!doctype html><html><head><meta charset="utf-8"><style>*{{box-sizing:border-box}}body{{margin:0;width:1200px;height:630px;padding:54px 64px;background:#091923;color:#edf5f6;font-family:Arial,sans-serif;overflow:hidden}}header{{display:flex;align-items:center;gap:18px;font-size:35px;font-weight:bold}}svg{{width:66px;height:66px}}em{{font-style:normal;color:#8fdfc8}}small{{display:block;color:#8fdfc8;font-size:18px;letter-spacing:3px;margin-top:38px}}h1{{font-size:48px;line-height:1.13;margin:18px 0;max-width:1030px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}}p{{font-size:23px;color:#afc5d1;line-height:1.5;max-width:1010px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin:0}}footer{{position:absolute;bottom:45px;left:64px;right:64px;border-top:1px solid #35515e;padding-top:20px;display:flex;justify-content:space-between;color:#8fdfc8;font-size:17px}}.ring{{position:absolute;border:1px solid #25424e;width:600px;height:600px;border-radius:50%;right:-350px;top:-170px;z-index:-1}}</style></head><body><div class="ring"></div><header>{logo}<span>sky<em>VV</em>ard</span></header><small>AIRCRAFT · STORIES · EXPLORATION</small><h1>{title}</h1><p>{description}</p><footer><span>{html.escape(url)}</span><span>Explore the aircraft →</span></footer></body></html>''')
  path=ROOT/'public'/row['image'].removeprefix('/watch/');path.parent.mkdir(parents=True,exist_ok=True);page.screenshot(path=str(path))
 browser.close()
print(f'Generated {len(rows)} static social cards; no uploads or runtime services.')
