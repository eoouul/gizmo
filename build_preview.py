# 페이지 하나를 스타일·스크립트·자산까지 한 파일에 넣은 미리보기로 만듭니다.
# GitHub Pages 에는 쓰지 않습니다(그쪽은 파일을 그대로 올리면 됩니다).
#   python3 build_preview.py                          -> preview.html (홈)
#   python3 build_preview.py projects/roulette-warrior/index.html preview-rw.html
import base64, os, re, sys
root = os.path.dirname(os.path.abspath(__file__))
mime = {".png": "image/png", ".webp": "image/webp", ".ttf": "font/ttf", ".jpg": "image/jpeg"}
cache = {}

def data_uri(m):
    name = m.group(1)
    if name not in cache:
        with open(os.path.join(root, "assets", name), "rb") as f:
            cache[name] = f"data:{mime[os.path.splitext(name)[1]]};base64,{base64.b64encode(f.read()).decode()}"
    return cache[name]

def build(page_rel, out_rel):
    page = os.path.join(root, page_rel)
    base = os.path.dirname(page)
    html = open(page, encoding="utf-8").read()
    read = lambda rel: open(os.path.normpath(os.path.join(base, rel)), encoding="utf-8").read()
    html = re.sub(r'<link rel="stylesheet" href="((?:\.\./)*styles\.css)">',
                  lambda m: "<style>" + read(m.group(1)) + "</style>", html)
    html = re.sub(r'<script src="((?:\.\./)*[A-Za-z0-9_\-]+\.js)"></script>',
                  lambda m: "<script>" + read(m.group(1)) + "</script>", html)
    html = re.sub(r'(?:\.\./)*assets/([A-Za-z0-9_.\-]+)', data_uri, html)
    out = os.path.join(root, out_rel)
    open(out, "w", encoding="utf-8").write(html)
    print(f"{out_rel}: {len(html)/1024/1024:.2f} MB")

if __name__ == "__main__":
    if len(sys.argv) == 3:
        build(sys.argv[1], sys.argv[2])
    else:
        build("index.html", "preview.html")
