from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public/airlines'
mark='<circle cx="48" cy="48" r="32" fill="none" stroke="#effffb" stroke-width="4"/><ellipse cx="48" cy="48" rx="42" ry="20" transform="rotate(-30 48 48)" fill="none" stroke="#92e4cd" stroke-width="4"/>'
assets={'SKYWARD-tail-v2':(512,512,'0 0 96 96',mark),'SKYWARD-body-v3':(1024,256,'0 0 1024 256','<text x="512" y="188" text-anchor="middle" fill="#f0fffb" font-family="DejaVu Sans,sans-serif" font-weight="bold" font-size="176" textLength="940" lengthAdjust="spacingAndGlyphs">sky<tspan fill="#8fdfc8">VV</tspan>ard</text>')}
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,args=['--no-sandbox'])
 for name,(w,h,box,inside) in assets.items():
  svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{box}">{inside}</svg>';(root/(name+'.svg')).write_text(svg)
  p=b.new_page(viewport={'width':w,'height':h});p.set_content('<style>body{margin:0;background:transparent}</style>'+svg);p.screenshot(path=str(root/(name+'.png')),omit_background=True);p.close()
 b.close()
