# 그림 목록(data/character_image_manifest.json)의 원본 PNG를 가로 720px JPEG로 줄여 public/images/ 에 둔다.
# 원본은 owner의 Codex 폴더에 있다(저장소에 원본은 넣지 않음). 관계 그림이 더 생기면 manifest를 바꾸고 다시 실행.
# 실행: python3 scripts/build_images.py [Codex 폴더 경로]
import json, os, subprocess, sys
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Documents/Codex")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
m = json.load(open(os.path.join(HERE, "data/character_image_manifest.json")))
out_types = os.path.join(HERE, "public/images/types"); out_pairs = os.path.join(HERE, "public/images/pairs")
os.makedirs(out_types, exist_ok=True); os.makedirs(out_pairs, exist_ok=True)
def conv(src, dst, width=720):
    if os.path.exists(dst): return
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "78", "--resampleWidth", str(width), os.path.join(ROOT, src), "--out", dst], check=True, capture_output=True)
n = 0
for t in m["types"]:
    conv(t["reference"], os.path.join(out_types, f"{t['slug']}-ref.jpg"), 560); n += 1
    for i, p in enumerate(t["intro_cuts"], 1):
        conv(p, os.path.join(out_types, f"{t['slug']}-{i}.jpg")); n += 1
for p in m["pairs"]:
    if p["status"] == "done":
        conv(p["feed"], os.path.join(out_pairs, f"{p['id']:03d}.jpg")); n += 1
print("converted", n)
