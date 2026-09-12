# index.html 의 assets/ 참조를 data URI 로 바꿔 한 파일짜리 미리보기를 만듭니다.
# GitHub Pages 에는 index.html 과 assets/ 를 그대로 올리면 되고, 이건 미리보기 전용입니다.
import base64, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, "index.html"), encoding="utf-8").read()
mime = {".png": "image/png", ".webp": "image/webp", ".ttf": "font/ttf"}
cache = {}
def data_uri(name):
    if name not in cache:
        path = os.path.join(here, "assets", name)
        b64 = base64.b64encode(open(path, "rb").read()).decode()
        cache[name] = f"data:{mime[os.path.splitext(name)[1]]};base64,{b64}"
    return cache[name]
out = re.sub(r'assets/([A-Za-z0-9_.\-]+)', lambda m: data_uri(m.group(1)), src)
dst = os.path.join(here, "preview.html")
open(dst, "w", encoding="utf-8").write(out)
print(f"preview.html {len(out)/1024/1024:.2f} MB, 자산 {len(cache)}개 내장")
