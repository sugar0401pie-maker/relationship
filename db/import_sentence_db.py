"""문장 DB 엑셀 ↔ 데이터 JSON

사용법
  내보내기:  python import_sentence_db.py export  ../02_데이터/relationship_test_data.json  03_문장DB.xlsx
  반영하기:  python import_sentence_db.py import  03_문장DB.xlsx  ../02_데이터/relationship_test_data.json  [--confirmed-only]

반영 규칙 (쏠 타로 문장 DB와 같은 방식)
  - 상태가 '확정'이고 수정안이 있으면 수정안을 JSON에 반영, 수정안이 없으면 원문 유지
  - --confirmed-only 가 없으면 '수정 필요' 행의 수정안도 반영 (검토용 빌드)
  - 자리표시자({애칭}, {A|은} 등)가 원문과 다르거나 금지 표현이 있으면 반영하지 않고 목록으로 알려줌

상담사 검수 패키지(05_상담사검수패키지_v1.xlsx, build_review_package.py로 생성)도 같은 명령으로 반영
  python import_sentence_db.py import  05_상담사검수패키지_v1.xlsx  ../02_데이터/relationship_test_data.json  --confirmed-only
  - 열은 머리글 이름(ID·원문·상태·수정안·json_path)으로 찾으므로 03_문장DB.xlsx와 새 패키지 모두 읽음
  - 새 패키지 상태: '수정' = 확정 수정(항상 반영), '보류' = --confirmed-only 가 없을 때만 수정안 반영(검토용 빌드), 'OK'·빈칸 = 원문 유지
  - pair_relations 행(예: pair_relations/수달→해달/흐름)도 일반 행과 똑같이 반영
  - 추가 안전장치: 시트의 원문이 지금 JSON과 다르면(그 사이 JSON이 바뀜) 거절, 이미 같은 값이면 '이미 반영'으로 건너뜀,
    같은 경로를 두 행이 다르게 고치면 거절, 해요체 어미·이별/인내/감시 표현은 경고만 출력
  - json_path가 없는 행(P5 예시 리포트, P4의 문서 파일 행)은 JSON 밖 파일이라 '수동 반영 필요' 목록으로만 출력
"""
import json, re, sys
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

BANNED = ["회피형", "불안형", "집착", "이기적", "최악", "상극", "헤밍웨이", "노인과 바다", "**",
          "은(는)", "는(은)", "이(가)", "가(이)", "을(를)", "를(을)", "와(과)", "과(와)"]   # 조사 병기 금지(마스터스펙 6)
# 원문에 없던 것이 수정안에 새로 들어가면 경고만 (반영은 함) — 마스터스펙 8-4, 작성규칙 '반드시 지킬 것'
WARN = ["헤어지", "헤어져", "이별", "끝내", "참으", "참아", "견디", "견뎌", "버텨 보세요", "위치 공유", "위치 추적",
        "휴대폰을 확인", "휴대폰 확인", "폰 검사", "패턴입니다", "문제입니다", "여러분"]
STATUS = ["초안", "확정", "수정 필요", "보류"]
FINAL = {"확정", "수정"}                       # 옛 문장DB '확정' + 새 검수 패키지 '수정'
DRAFT_OLD, DRAFT_NEW = {"수정 필요"}, {"보류"}   # --confirmed-only 없을 때만 반영 (옛 문장DB의 '보류'는 예전처럼 반영 안 함)

# 시트 이름 → (JSON 최상위 키, 사람이 읽는 ID 접두어)
SHEETS = [
    ("유형", "types"), ("계열", "families"), ("base_knowledge", "base_knowledge"),
    ("관계 문장", "pairs"), ("고리 흐름", "loop_flow"), ("엇갈림·저울·내 마음", ("mismatch", "balance", "inner_outer")),
    ("화면 문구", "ui_copy"), ("1부 문항", "part1_competency"), ("2부 문항", "part2_competency"), ("방식 장면", "mode_scenes"),
]
SKIP_KEYS = {"score", "id", "display_order", "display_order_속", "display_order_겉", "역량", "구분", "부", "mode", "competency",
             "name", "family", "관계구분", "질문"}
PAIR_SKIP = {"A", "B"}   # pairs의 A·B는 유형 이름이라 제외 (loop_flow의 A·B는 문장이라 포함)

def walk(o, path):
    if isinstance(o, str):
        yield path, o
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from walk(v, path + [i])
    elif isinstance(o, dict):
        for k, v in o.items():
            if k in SKIP_KEYS or (path and path[0] == "pairs" and k in PAIR_SKIP):
                continue
            yield from walk(v, path + [k])

def readable(D, path):
    """['types', 3, '강점', 1] → 'types/비버/강점/2' 처럼 사람이 알아보기 쉬운 ID"""
    out, cur = [], D
    for p in path:
        if isinstance(p, int):
            item = cur[p]
            label = None
            if isinstance(item, dict):
                label = item.get("id") or item.get("name") or item.get("역량") or (f'{item.get("A")}×{item.get("B")}' if "A" in item else None)
            out.append(label or str(p + 1))
        else:
            out.append(p)
        cur = cur[p]
    return "/".join(map(str, out))

def placeholders(s):
    return sorted(re.findall(r"\{[^}]+\}", s))

def export(json_path, xlsx_path):
    D = json.load(open(json_path, encoding="utf-8"))
    wb = Workbook(); wb.remove(wb.active)
    F = Font(name="Arial", size=10); H = Font(name="Arial", bold=True, color="FFFFFF")
    HF = PatternFill("solid", fgColor="013566"); IN = PatternFill("solid", fgColor="FDF6E9")
    total = 0
    for sheet, keys in SHEETS:
        ws = wb.create_sheet(sheet)
        ws.append(["ID", "원문", "상태", "수정안", "메모", "json_path"])
        for c in ws[1]: c.font = H; c.fill = HF
        for k in (keys if isinstance(keys, tuple) else (keys,)):
            for path, text in walk(D[k], [k]):
                ws.append([readable(D, path), text, "초안", None, None, json.dumps(path, ensure_ascii=False)])
                total += 1
        for row in ws.iter_rows(min_row=2):
            for c in row: c.font = F; c.alignment = Alignment(wrap_text=True, vertical="top")
            for c in row[2:5]: c.fill = IN
        for col, w in zip("ABCDEF", [34, 70, 10, 50, 24, 10]): ws.column_dimensions[col].width = w
        ws.column_dimensions["F"].hidden = True
        ws.freeze_panes = "B2"
        dv = DataValidation(type="list", formula1='"' + ",".join(STATUS) + '"'); ws.add_data_validation(dv); dv.add(f"C2:C{ws.max_row}")
    g = wb.create_sheet("안내", 0)
    for line in ["강에 사는 나, 바다에 사는 너 — 쏠 마을 관계 테스트 문장 DB", "",
                 "노란(크림) 칸만 채워 주세요: 상태(초안/확정/수정 필요/보류), 수정안, 메모",
                 "자리표시자 {애칭}, {A|은} 같은 중괄호 부분은 지우거나 바꾸지 마세요. 바뀌면 반영되지 않아요.",
                 "검수가 끝나면 import_sentence_db.py import 로 데이터 JSON에 반영합니다. 그 뒤로는 이 엑셀이 문장 원본이에요.",
                 f"전체 문장 수: {total}"]:
        g.append([line])
    g.column_dimensions["A"].width = 100
    wb.save(xlsx_path); print(f"내보냄: {total}문장 → {xlsx_path}")

def set_path(D, path, value):
    cur = D
    for p in path[:-1]: cur = cur[p]
    cur[path[-1]] = value

def get_path(D, path):
    cur = D
    for p in path: cur = cur[p]
    return cur

def haeyo_endings(s):
    """따옴표 밖 해요체 문장 끝(요. 요? 요!) — '~세요', '~할까요?'는 허용"""
    s = re.sub(r'"[^"]*"|“[^”]*”|‘[^’]*’|\'[^\']*\'', "", s)
    return [m.group(0) for m in re.finditer(r"[가-힣]{1,3}요(?:[.?!]|$)", s)
            if not re.search(r"(세요|까요|필요|중요)[.?!]?$", m.group(0))]


def header_index(ws):
    head = [str(c.value).strip() if c.value is not None else "" for c in next(ws.iter_rows(min_row=1, max_row=1))]
    if "json_path" not in head or "수정안" not in head or "상태" not in head:
        return None
    ix = {k: head.index(k) for k in ("ID", "원문", "상태", "수정안", "json_path") if k in head}
    ix["_new"] = "위치(화면·리포트)" in head      # 새 검수 패키지 형식
    return ix


def do_import(xlsx_path, json_path, confirmed_only):
    D = json.load(open(json_path, encoding="utf-8"))
    wb = load_workbook(xlsx_path); applied, rejected, warned, manual, already = 0, [], [], [], 0
    seen = {}
    for ws in wb.worksheets:
        ix = header_index(ws)
        if ix is None: continue          # 안내·진행 현황·유형 참고 등
        for row in ws.iter_rows(min_row=2, values_only=True):
            val = lambda k: row[ix[k]] if k in ix and ix[k] < len(row) else None
            rid, orig, status, edit, jp = val("ID"), val("원문"), val("상태"), val("수정안"), val("json_path")
            status = str(status).strip() if status else ""
            if not edit or not str(edit).strip(): continue
            if status not in FINAL and (confirmed_only or status not in (DRAFT_NEW if ix["_new"] else DRAFT_OLD)): continue
            edit = str(edit).strip()
            if not jp:
                manual.append((ws.title, rid)); continue
            path = json.loads(jp)
            try:
                cur = get_path(D, path)
            except (KeyError, IndexError, TypeError):
                rejected.append((rid, "JSON에 없는 경로")); continue
            if not isinstance(cur, str):
                rejected.append((rid, "문장이 아닌 값")); continue
            key = json.dumps(path, ensure_ascii=False)
            if key in seen and seen[key] != edit:
                rejected.append((rid, "같은 경로를 다른 행이 다르게 수정 (" + seen[key][:20] + "…)")); continue
            seen[key] = edit
            if cur == edit:
                already += 1; continue
            if orig is not None and "원문" in ix and str(orig) != cur:
                rejected.append((rid, "시트 원문이 지금 JSON과 다름 — 패키지를 다시 만들어 주세요")); continue
            if placeholders(edit) != placeholders(cur):
                rejected.append((rid, "자리표시자 불일치")); continue
            bad = [w for w in BANNED if w in edit]
            if bad:
                rejected.append((rid, "금지 표현: " + ", ".join(bad))); continue
            w = [x for x in WARN if x in edit and x not in cur]
            new_haeyo = [e for e in haeyo_endings(edit) if e not in haeyo_endings(cur)]
            if new_haeyo: w.append("해요체 어미: " + ", ".join(new_haeyo))
            if w: warned.append((rid, "; ".join(w)))
            set_path(D, path, edit); applied += 1
    json.dump(D, open(json_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"반영 {applied}건, 거절 {len(rejected)}건" + (f", 이미 반영 {already}건" if already else ""))
    for r in rejected: print("  거절:", *r)
    for r in warned: print("  경고(반영됨, 확인 필요):", *r)
    if manual:
        print(f"수동 반영 필요 {len(manual)}건 (JSON 밖 파일 — 예시 리포트·문서):")
        for t, rid in manual: print("  ", t, rid)
    return applied, rejected, warned, manual


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "export": export(sys.argv[2], sys.argv[3])
    elif cmd == "import": do_import(sys.argv[2], sys.argv[3], "--confirmed-only" in sys.argv)
