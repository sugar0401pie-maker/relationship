"""상담사 검수 패키지 만들기 (데이터 JSON → 우선순위별 검수 엑셀)

사용법 (06_DB 폴더에서)
  python build_review_package.py ../02_데이터/relationship_test_data.json 05_상담사검수패키지_v1.xlsx \
      --hapsho 관계성테스트_합쇼체_변환검수.xlsx --samples ../01_설계/sample_reports_10pairs.md

- ID 열 = JSON 경로('/'로 이음, 리스트 번호는 0부터). 숨긴 json_path 열과 함께 import_sentence_db.py import 로 반영됨.
- --hapsho 가 있으면 '확인 필요(Y)' 480행을 P1~P3·P5 행의 '참고' 열에 표시하고, 거기 없는 행만 P4 시트로 모음.
- --samples 가 있으면 예시 리포트 10개를 섹션 단위로 P5 시트에 넣음 (JSON 밖 파일이라 import 시 '수동 반영' 목록으로 나옴).
"""
import json, re, sys, argparse
from pathlib import Path
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule

STATUS = ["OK", "수정", "보류"]
MODES = ["다가가기", "맞춰주기", "거리두기", "조율하기"]
HEAD = ["ID", "위치(화면·리포트)", "공개", "유형/쌍", "원문", "참고", "상태", "수정안", "메모", "json_path"]
WIDTH = [26, 24, 9, 22, 70, 22, 8, 50, 26, 8]

UI_POS = {
    "safety_notice_start": "시작 화면 안전 안내(고정)",
    "safety_contacts": "안전 안내 연락처", "disclaimer": "결과 하단 고정 고지문",
    "onboarding_bullets": "시작 화면 안내", "part1_intro": "1부 시작 안내", "part2_intro": "2부 시작 안내",
    "confirm_comp_single": "역량 확인 화면", "confirm_comp_tie": "역량 확인 화면 (동점)", "confirm_comp_allhigh": "역량 확인 화면 (모두 높음)",
    "confirm_mode": "방식 확인 화면 (나)", "confirm_partner": "방식 확인 화면 ({애칭})",
    "result_sentence": "결과 첫 문장", "hidden_reveal": "히든 유형 공개", "partner_title": "{애칭} 카드 제목",
    "neighbor": "결과 카드 '가까운 이웃'", "consistency_item": "결과 카드 일관성 안내", "consistency_all": "결과 상단 일관성 안내",
    "partner_unseen": "{애칭} 카드 (판단 부족 항목)", "partner_insufficient": "{애칭} 카드 (판단 부족)",
    "paywall_card_title": "결제 카드 제목", "paywall_includes": "결제 카드 포함 내용", "paywall_button": "결제 버튼",
    "sticky_bar": "하단 고정 바", "share_title": "공유 카드 제목", "share_button": "공유 카드 버튼",
    "report_lead_template": "리포트 4번 앞 2줄 틀 (무료 미리보기)",
}
UI_ORDER = ["safety_notice_start", "safety_contacts", "disclaimer",
            "onboarding_bullets", "part1_intro", "part2_intro",
            "confirm_comp_single", "confirm_comp_tie", "confirm_comp_allhigh", "confirm_mode", "confirm_partner",
            "result_sentence", "hidden_reveal", "partner_title", "neighbor", "consistency_item", "consistency_all",
            "partner_unseen", "partner_insufficient", "report_lead_template",
            "paywall_card_title", "paywall_includes", "paywall_button", "sticky_bar", "share_title", "share_button"]
SAFETY = {"safety_notice_start", "safety_contacts", "disclaimer"}
BK_POS = {"무료_당신은": ("리포트 2번 '당신은 이런 사람입니다'", "무료"), "관련 이론": ("리포트 2번 아래 관련 이론", "무료"),
          "무료_애칭은": ("리포트 3번 '당신이 보는 {애칭}은 이럴 거예요'", "무료"),
          "성격적 특징": ("리포트 4~8번 AI 재료 (유형 원재료)", "AI재료"), "연애 장면": ("리포트 4번 AI 재료", "AI재료"),
          "서운함을 느끼는 순간": ("리포트 5·6번 AI 재료", "AI재료"), "상대를 서운하게 하기 쉬운 순간": ("리포트 5·6번 AI 재료", "AI재료"),
          "조율 포인트": ("리포트 7번 AI 재료", "AI재료")}
LF_POS = {"계기": ("리포트 4번 앞 2줄 (무료 미리보기)", "미리보기"), "A": ("리포트 4번 앞 2줄 (나의 첫 움직임)", "미리보기"),
          "B": ("리포트 4번 앞 2줄 (나의 첫 움직임)", "미리보기"), "끝": ("리포트 4번 AI 재료", "AI재료"),
          "맞물림": ("리포트 4번 AI 재료 (잘 맞물리는 순간)", "AI재료"), "다리": ("리포트 7·8번 AI 재료 (다리 놓기)", "AI재료"),
          "안내": ("거리두기×거리두기 추가 안내", "AI재료")}
P4_POS = {"part1_competency": ("1부 문항 장면 (검수 끝난 문항 — 어미만 확인)", "무료"),
          "part2_competency": ("2부 문항 장면 (어미만 확인)", "무료"),
          "mode_scenes": ("방식 장면 문항 (어미만 확인)", "무료"),
          "loops": ("고리 설명", "무료"), "paywall": ("결과 화면 구성 설명 (내부)", "내부")}
FREE_PR = ["무료_설명", "이야기_한줄", "쏠_마을_이야기"]
PAID_PR = ["흐름", "서로에게_주는_것", "엇갈리는_순간", "내가_해볼_한_걸음", "부탁해_볼_말"]


def walk(o, path):
    if isinstance(o, str):
        yield path, o
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from walk(v, path + [i])
    elif isinstance(o, dict):
        for k, v in o.items():
            yield from walk(v, path + [k])


def pid(path):
    return "/".join(map(str, path))


class Builder:
    def __init__(self, D):
        self.D = D
        self.types = {t["name"]: t for t in D["types"]}
        self.order = [t["name"] for t in D["types"]]
        self.loopname = {l["조합"].replace(" ", ""): l["고리"] for l in D["loops"]}
        self.sheets = {}          # name -> list of rows (dict)
        self.covered = {}         # id -> sheet name

    def tlabel(self, n):
        t = self.types[n]
        return f'{n}({t["competency"]}·{t["mode"]})'

    def pair_label(self, a, b):
        ma, mb = self.types[a]["mode"], self.types[b]["mode"]
        k = sorted([ma, mb], key=MODES.index)
        key = "×".join(k)
        role = "A·B 같음" if ma == mb else ("A" if ma == k[0] else "B")
        return f'{self.tlabel(a)} → {self.tlabel(b)}\n고리: {self.loopname.get(key, key)} (나의 역할 {role})'

    def add(self, sheet, path, pos, pub, who, note=""):
        text = self.D
        for p in path: text = text[p]
        assert isinstance(text, str), path
        i = pid(path)
        assert i not in self.covered, f"중복 ID {i}"
        self.covered[i] = sheet
        self.sheets.setdefault(sheet, []).append(dict(id=i, pos=pos, pub=pub, who=who, text=text, note=note,
                                                       jp=json.dumps(path, ensure_ascii=False)))

    def add_tree(self, sheet, root, pos, pub, who, note=""):
        node = self.D
        for p in root: node = node[p]
        for path, _ in walk(node, list(root)):
            self.add(sheet, path, pos, pub, who, note)

    def build(self):
        D = self.D
        S1, S2, S3, SP2, SP3 = "P1-1 안전·화면문구", "P1-2 무료리포트 1~3번", "P1-3 방향별관계 무료", "P2 유형·고리 재료", "P3 방향별관계 유료재료"
        # P1-1 화면 문구
        assert set(UI_ORDER) == set(D["ui_copy"]), set(D["ui_copy"]) ^ set(UI_ORDER)
        for k in UI_ORDER:
            pub = "무료" if not k.startswith(("paywall", "sticky")) else "결제 안내"
            note = "안전·고지 (D19)" if k in SAFETY else ""
            if k == "safety_options":
                note += "\n보기 문구는 scoring.js가 글자 그대로 비교합니다. 바꾸려면 메모로 남겨 주세요(코드도 함께 수정 필요)."
            self.add_tree(S1, ["ui_copy", k], UI_POS[k], pub, "공통", note)
        for i, r in enumerate(D["report_outline"]):
            self.add(S1, ["report_outline", i, "섹션"], "리포트 섹션 제목 (블러 구간에서도 선명하게 보임)", "무료", "공통")
        for i, t in enumerate(D["types"]):
            self.add(S1, ["types", i, "desc"], "결과 유형 카드 '이런 모습'", "무료", self.tlabel(t["name"]))
            self.add(S1, ["types", i, "contrast"], "결과 유형 카드 '대비 한 줄'", "무료", self.tlabel(t["name"]))
        for i, f in enumerate(D["families"]):
            self.add(S1, ["families", i, "결과문구"], "결과 유형 카드 계열 문구", "무료", f'{f["역량"]} · {f["계열"]}')
        for i, l in enumerate(D["loops"]):
            self.add(S1, ["loops", i, "고리"], "우리 고리 카드 이름 / 리포트 4번 첫 줄", "무료", l["조합"])
            self.add(S1, ["loops", i, "이야기"], "고리 소개·공유 이미지 기본값", "무료", f'{l["조합"]} (대표짝 {l["대표짝"]})')
        for k, v in D["loop_flow"].items():
            for f in ("계기", "A", "B"):
                if f in v:
                    self.add(S1, ["loop_flow", k, f], LF_POS[f][0], LF_POS[f][1], f"고리 {k}", "{A}=앞쪽 방식, {B}=뒤쪽 방식")
        # P1-2 리포트 1~3번 (유형 순서)
        for i, p in enumerate(D["pairs"]):
            who = f'{self.tlabel(p["A"])} × {self.tlabel(p["B"])}'
            self.add(S2, ["pairs", i, "공통점"], "리포트 1번 두 줄 (첫 줄) · 공유 카드", "무료", who)
            self.add(S2, ["pairs", i, "차이점"], "리포트 1번 두 줄 (둘째 줄) · 공유 카드", "무료", who)
        for n in self.order:
            for f in ("무료_당신은", "관련 이론", "무료_애칭은"):
                self.add(S2, ["base_knowledge", n, f], BK_POS[f][0], BK_POS[f][1], self.tlabel(n))
        # P1-3 방향별 무료
        usage = {u["필드"]: u["자리"] for u in D["pair_relations_usage"]["필드"]}
        for key in self.pair_keys():
            a, b = key.split("→")
            for f in FREE_PR:
                self.add(S3, ["pair_relations", key, f], usage[f], "무료", self.pair_label(a, b))
        # P2 유형·고리 재료
        for i, t in enumerate(D["types"]):
            for f, pos in (("강점", "유형 강점 (AI 재료)"), ("약점", "유형 약점 (AI 재료)"), ("제안", "유형 제안 → 리포트 8번 AI 재료")):
                self.add_tree(SP2, ["types", i, f], pos, "AI재료", self.tlabel(t["name"]))
        for n in self.order:
            for f in ("성격적 특징", "연애 장면", "서운함을 느끼는 순간", "상대를 서운하게 하기 쉬운 순간", "조율 포인트"):
                self.add_tree(SP2, ["base_knowledge", n, f], BK_POS[f][0], BK_POS[f][1], self.tlabel(n))
        for k, v in D["loop_flow"].items():
            for f in v:
                if f not in ("계기", "A", "B"):
                    self.add(SP2, ["loop_flow", k, f], LF_POS[f][0], LF_POS[f][1], f"고리 {k}", "{A}=앞쪽 방식, {B}=뒤쪽 방식")
        for i, f in enumerate(D["families"]):
            for fld in ("상징", "묻는것", "흔들릴때", "이론", "연결"):
                if fld in f:
                    self.add(SP2, ["families", i, fld], f"계열 설명 '{fld}'", "AI재료", f'{f["역량"]} · {f["계열"]}')
        for i, l in enumerate(D["loops"]):
            self.add(SP2, ["loops", i, "근거"], "고리 이론 근거 (내부)", "내부", l["조합"])
        self.add_tree(SP2, ["mismatch"], "가장 엇갈리는 지점 → 리포트 7번 AI 재료", "AI재료", "역량별")
        self.add_tree(SP2, ["balance"], "먼저 건네기 저울 → 리포트 7번 AI 재료 / 배지", "AI재료", "공통")
        self.add_tree(SP2, ["inner_outer"], "공유 카드 '내 마음' 문장 (결제 후) · AI 재료", "유료", "역량별")
        # P3 방향별 유료 재료
        for key in self.pair_keys():
            a, b = key.split("→")
            for f in PAID_PR:
                self.add(SP3, ["pair_relations", key, f], usage[f], "AI재료(유료)", self.pair_label(a, b))
        return [S1, S2, S3, SP2, SP3]

    def pair_keys(self):
        keys = list(self.D["pair_relations"])
        assert len(keys) == len(self.order) ** 2
        return sorted(keys, key=lambda k: tuple(self.order.index(x) for x in k.split("→")))


def find_path(D, path_str, after):
    """변환검수 경로가 지금 JSON에서 같은 문장을 가리키는지 확인, 아니면 같은 문장이 있는 경로를 찾음"""
    cur = D
    try:
        for x in path_str.split("/"):
            cur = cur[int(x)] if isinstance(cur, list) else cur[x]
        if cur == after: return path_str
    except (KeyError, IndexError, ValueError, TypeError):
        pass
    hits = [pid(p) for p, s in walk(D, []) if s == after]
    return hits[0] if len(hits) == 1 else None


def norm_md(s):
    s = re.sub(r"^\s*(?:[-•]|\d+\.)\s*", "", s.strip())
    return s.replace("**", "").strip()


def parse_samples(md_path):
    lines = Path(md_path).read_text(encoding="utf-8").split("\n")
    samples, cur, sec = [], None, None
    for ln, line in enumerate(lines, 1):
        m = re.match(r"^# 샘플 (\d+)\. (.*)$", line)
        if m:
            cur = dict(no=int(m.group(1)), title=m.group(2), summary="", secs=[], start=ln); samples.append(cur); sec = None; continue
        if cur is None: continue
        if line.startswith("> 입력 요약:"):
            cur["summary"] = line[2:].strip(); continue
        m = re.match(r"^### (\d)\. (.*)$", line)
        if m:
            sec = dict(no=m.group(1), title=m.group(2), part="", lines=[], start=ln); cur["secs"].append(sec); continue
        if line.startswith("--- 여기부터 유료"):
            sec = dict(no=sec["no"], title=sec["title"], part="유료 본문", lines=[], start=ln + 1); cur["secs"].append(sec)
            cur["secs"][-2]["part"] = "앞 2줄"; continue
        if line.strip() == "---" and sec:   # 샘플 끝
            sec = None; continue
        if sec is not None:
            sec["lines"].append((ln, line))
    return samples


def write_sheet(wb, name, rows, extra_cols=None):
    ws = wb.create_sheet(name)
    head = HEAD if not extra_cols else HEAD[:6] + extra_cols + HEAD[6:]
    widths = WIDTH if not extra_cols else WIDTH[:6] + [40] * len(extra_cols) + WIDTH[6:]
    ws.append(head)
    H = Font(name="Arial", bold=True, color="FFFFFF", size=10); HF = PatternFill("solid", fgColor="013566")
    F = Font(name="Arial", size=10); IN = PatternFill("solid", fgColor="FDF6E9"); NOTE = Font(name="Arial", size=9, color="7A5C00")
    thin = Side(style="thin", color="D9D9D9")
    for c in ws[1]:
        c.font = H; c.fill = HF; c.alignment = Alignment(wrap_text=True, vertical="center")
    for r in rows:
        vals = [r["id"], r["pos"], r["pub"], r["who"], r["text"], r["note"] or None]
        if extra_cols: vals += [r.get("extra")]
        vals += [None, None, None, r["jp"]]
        ws.append(vals)
    ne = len(extra_cols or [])
    st_col = 7 + ne                     # 상태 열 번호 (1부터)
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.font = F; c.alignment = Alignment(wrap_text=True, vertical="top"); c.border = Border(bottom=thin)
        row[5].font = NOTE
        for c in row[st_col - 1:st_col + 2]: c.fill = IN
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[ws.cell(1, i).column_letter].width = w
    ws.column_dimensions[ws.cell(1, len(head)).column_letter].hidden = True
    ws.freeze_panes = "F2"
    ws.auto_filter.ref = f"A1:{ws.cell(1, len(head) - 1).column_letter}{max(ws.max_row, 2)}"
    L = ws.cell(1, st_col).column_letter
    dv = DataValidation(type="list", formula1='"' + ",".join(STATUS) + '"', allow_blank=True,
                        showErrorMessage=True, errorTitle="상태", error="OK / 수정 / 보류 중에서 골라 주세요.")
    ws.add_data_validation(dv); dv.add(f"{L}2:{L}{max(ws.max_row, 2)}")
    rng = f"A2:{ws.cell(1, len(head) - 1).column_letter}{max(ws.max_row, 2)}"
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'${L}2="OK"'], fill=PatternFill("solid", fgColor="E6F2E6")))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'${L}2="수정"'], fill=PatternFill("solid", fgColor="FFF0D6")))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'${L}2="보류"'], fill=PatternFill("solid", fgColor="EDEDED")))
    ws.sheet_view.zoomScale = 110
    return ws, L


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("json"); ap.add_argument("xlsx")
    ap.add_argument("--hapsho"); ap.add_argument("--samples")
    a = ap.parse_args()
    D = json.load(open(a.json, encoding="utf-8"))
    B = Builder(D); names = B.build()
    rows_by_id = {r["id"]: r for n in names for r in B.sheets[n]}
    bk_text = {s: pid(p) for p, s in walk(D["base_knowledge"], ["base_knowledge"])}

    # P5 예시 리포트
    p5, samples = [], []
    if a.samples:
        samples = parse_samples(a.samples)
        rel = "01_설계/" + Path(a.samples).name
        for s in parse_samples(a.samples):
            for sec in s["secs"]:
                body = "\n".join(l for _, l in sec["lines"]).strip()
                part = f' ({sec["part"]})' if sec["part"] else ""
                pub = "무료" if sec["no"] in "123" or sec["part"] == "앞 2줄" else "유료(AI 예시)"
                p5.append(dict(id=f'{rel}#샘플{s["no"]}/{sec["no"]}' + ("-유료" if sec["part"] == "유료 본문" else ""),
                               pos=f'리포트 {sec["no"]}번{part}: {sec["title"]}', pub=pub,
                               who=f'샘플 {s["no"]}. {s["title"]}', text=body, note="", jp=None,
                               lines=(sec["lines"][0][0] if sec["lines"] else sec["start"], sec["lines"][-1][0] if sec["lines"] else sec["start"])))
        # 샘플마다 첫 행 참고 열에 입력 요약
        first = {}
        for r in p5:
            k = r["who"]
            if k not in first: first[k] = r
        for s in parse_samples(a.samples):
            k = f'샘플 {s["no"]}. {s["title"]}'
            if k in first: first[k]["note"] = s["summary"]

    # P4 합쇼체 확인 필요 행
    p4, flagged, hap_total, dropped = [], {"P1~P3": 0, "P5": 0, "P4": 0}, 0, []
    if a.hapsho:
        ws = load_workbook(a.hapsho, read_only=True)["변환검수"]
        for f, path_s, before, after, need in ws.iter_rows(min_row=2, values_only=True):
            if need != "Y": continue
            hap_total += 1
            mark = "합쇼체 변환 확인 필요 · 변환 전: " + (before or "")
            target = None
            if f == "relationship_test_data.json":
                p = find_path(D, path_s, after)
                if p and p in rows_by_id: target = rows_by_id[p]
                elif p is None:
                    dropped.append((path_s, "지금 JSON에 없는 문장(이후 다시 고쳐짐)")); continue
                elif p:
                    path = []
                    for x in p.split("/"):
                        path.append(int(x) if x.isdigit() else x)
                    pos, pub = P4_POS.get(path[0], (f"데이터 {path[0]}", "내부"))
                    p4.append(dict(id=p, pos=pos, pub=pub, who="",
                                   text=after, note="", jp=json.dumps(path, ensure_ascii=False), extra=before)); flagged["P4"] += 1; continue
            elif f == "base_knowledge_21types.md":
                p = bk_text.get(norm_md(after))
                if p and p in rows_by_id: target = rows_by_id[p]
            elif f == "sample_reports_10pairs.md":
                ln = int(path_s.lstrip("L"))
                for smp in samples:   # 샘플 머리(입력 요약 줄) → 그 샘플 첫 행
                    if smp["secs"] and smp["start"] <= ln < smp["secs"][0]["start"]:
                        target = next(r for r in p5 if r["who"] == f'샘플 {smp["no"]}. {smp["title"]}')
                for r in ([] if target else p5):
                    if r["lines"][0] - 1 <= ln <= r["lines"][1]: target = r; break
                if target is None and norm_md(after):
                    for r in p5:
                        if norm_md(after) in r["text"]: target = r; break
            if target is None and f.endswith((".mjs", ".js")):
                dropped.append((f"{f}:{path_s}", "코드 테스트 문자열(사용자에게 안 보임)")); continue
            if target is not None:
                target["note"] = (target["note"] + "\n" if target["note"] else "") + ("합쇼체 변환 확인 필요" if target in p5 else mark)
                flagged["P5" if target in p5 else "P1~P3"] += 1
            else:
                p4.append(dict(id=f"{f}:{path_s}", pos=f"{f} {path_s}", pub="문서(JSON 밖)" if not f.endswith("json") else "데이터",
                               who="", text=after, note="JSON 밖 파일 — import 시 수동 반영 목록으로 나옴" if not f.endswith("data.json") else "",
                               jp=None, extra=before)); flagged["P4"] += 1
        # 문서 파일의 같은 문장(예: base_knowledge md의 21개 같은 제목)은 한 행으로
        merged = {}
        for r in p4:
            k = (r["jp"] is None, r["id"].split(":")[0] if r["jp"] is None else r["id"], r["text"])
            if r["jp"] is None and k in merged:
                m = merged[k]; m["_lines"].append(r["id"].split(":", 1)[1])
            else:
                r["_lines"] = [r["id"].split(":", 1)[1]] if r["jp"] is None else []; merged[k] = r
        p4 = list(merged.values())
        for r in p4:
            if r["jp"] is None and len(r["_lines"]) > 1:
                f0 = r["id"].split(":")[0]
                r["id"] = f'{f0}:{",".join(r["_lines"])}'; r["pos"] = f'{f0} ({len(r["_lines"])}곳 같은 문장)'
        flagged["P4"] = len(p4)
        # 같은 행에 여러 번 붙은 P5 표시 정리
        for r in p5:
            if r["note"]:
                parts = r["note"].split("\n"); r["note"] = "\n".join(dict.fromkeys(parts))
                n = sum(1 for x in parts if x == "합쇼체 변환 확인 필요")
                if n > 1: r["note"] = r["note"].replace("합쇼체 변환 확인 필요", f"합쇼체 변환 확인 필요 ({n}곳)")

    wb = Workbook(); wb.remove(wb.active)
    sheet_cols = {}
    for n in names:
        ws, L = write_sheet(wb, n, B.sheets[n]); sheet_cols[n] = (L, len(B.sheets[n]))
    if a.hapsho:
        n4 = "P4 합쇼체 확인(나머지)"
        ws, L = write_sheet(wb, n4, p4, extra_cols=["변환 전(해요체)"]); sheet_cols[n4] = (L, len(p4))
    if a.samples:
        n5 = "P5 예시리포트 10개"
        ws, L = write_sheet(wb, n5, p5); sheet_cols[n5] = (L, len(p5))
        ws.column_dimensions["E"].width = 90

    # 유형 참고표
    wr = wb.create_sheet("유형 참고")
    wr.append(["유형", "역량", "방식", "계열", "이런 모습"])
    for t in D["types"]:
        wr.append([t["name"], t["competency"], t["mode"], t["family"], t["desc"]])
    wr.append([]); wr.append(["고리(방식 조합)", "고리 이름", "근거", "대표짝"])
    hdr2 = wr.max_row
    for l in D["loops"]:
        wr.append([l["조합"], l["고리"], l["근거"], l["대표짝"]])
    for r in (1, hdr2):
        for c in wr[r]:
            if c.value: c.font = Font(name="Arial", bold=True, color="FFFFFF", size=10); c.fill = PatternFill("solid", fgColor="013566")
    for col, w in zip("ABCDE", [16, 22, 26, 16, 70]): wr.column_dimensions[col].width = w
    for row in wr.iter_rows(min_row=2):
        for c in row:
            if c.font is None or not c.font.bold: c.font = Font(name="Arial", size=10)
            c.alignment = Alignment(wrap_text=True, vertical="top")

    # 진행 현황
    wp = wb.create_sheet("진행 현황", 0)
    wp.append(["시트", "전체", "OK", "수정", "보류", "미검수", "진행률"])
    for i, (n, (L, cnt)) in enumerate(sheet_cols.items(), 2):
        q = f"'{n}'"
        wp.append([n, f'=COUNTA({q}!A:A)-1', f'=COUNTIF({q}!{L}:{L},"OK")', f'=COUNTIF({q}!{L}:{L},"수정")',
                   f'=COUNTIF({q}!{L}:{L},"보류")', f"=B{i}-C{i}-D{i}-E{i}", f"=IF(B{i}=0,0,(C{i}+D{i}+E{i})/B{i})"])
    last = wp.max_row
    wp.append(["합계"] + [f"=SUM({c}2:{c}{last})" for c in "BCDEF"] + [f"=IF(B{last+1}=0,0,(C{last+1}+D{last+1}+E{last+1})/B{last+1})"])
    for c in wp[1]: c.font = Font(name="Arial", bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="013566")
    for row in wp.iter_rows(min_row=2):
        for c in row: c.font = Font(name="Arial", size=10, bold=(row[0].value == "합계"))
        row[6].number_format = "0%"
    wp.column_dimensions["A"].width = 26
    for col in "BCDEFG": wp.column_dimensions[col].width = 10

    # 안내
    cnt = {n: c for n, (_, c) in sheet_cols.items()}
    g = wb.create_sheet("안내", 0)
    lines = [
        ("강에 사는 나, 바다에 사는 너 — 쏠 마을 관계 테스트 — 상담사 검수 패키지 v1", "title"),
        (f"데이터 버전 {D.get('version')} · 만든 날 2026-10-21 · 문장은 모두 데이터 JSON에서 그대로 뽑았습니다.", None),
        ("", None),
        ("1. 무엇을 보나요", "h"),
        ("사용자에게 보이거나 AI 리포트의 재료가 되는 문장을 상담 전문가 눈으로 확인합니다. 문항·보기·점수(1부·2부·방식 장면)는 이미 검수를 거친 문구라 제외했고, 합쇼체 변환으로 바뀐 몇 곳만 P4에 있습니다.", None),
        ("", None),
        ("2. 우선순위 (위에서부터 보시면 됩니다)", "h"),
        (f"P1-1 안전·화면문구 ({cnt.get('P1-1 안전·화면문구')}행) — 안전 문항·안내·고지문, 확인 화면, 결과 카드, 결제·공유 문구. 모든 사용자가 무료로 보고, 안전 문구는 위험할 수 있어 가장 먼저.", None),
        (f"P1-2 무료리포트 1~3번 ({cnt.get('P1-2 무료리포트 1~3번')}행) — 231쌍 공통점·차이점(리포트 1번·공유 카드)과 유형별 무료 문단(리포트 2·3번).", None),
        (f"P1-3 방향별관계 무료 ({cnt.get('P1-3 방향별관계 무료')}행) — 441방향 × 무료_설명·이야기_한줄·쏠_마을_이야기. 무료 화면과 공유 카드에 그대로 나갑니다. 방향마다 3행씩 붙어 있습니다.", None),
        (f"P2 유형·고리 재료 ({cnt.get('P2 유형·고리 재료')}행) — 유형 강점·약점·제안, 유형 원재료(서운함·조율 포인트 등), 고리 흐름(끝·맞물림·다리), 엇갈림·저울·내 마음. 유료 AI 리포트의 뼈대라 유형 이론과 맞는지가 중요.", None),
        (f"P3 방향별관계 유료재료 ({cnt.get('P3 방향별관계 유료재료')}행) — 441방향 × 흐름·서로에게_주는_것·엇갈리는_순간·내가_해볼_한_걸음·부탁해_볼_말. 사용자에게 그대로 보이지 않고 AI가 다시 쓰므로 뒤로 미뤘습니다.", None),
        (f"P4 합쇼체 확인(나머지) ({cnt.get('P4 합쇼체 확인(나머지)', 0)}행) — 해요체→합쇼체 변환에서 '확인 필요'로 표시된 {hap_total}행 중 P1~P3·P5에 없는 것만. 나머지는 해당 행 '참고' 열에 '합쇼체 변환 확인 필요'로 표시했습니다.", None),
        (f"P5 예시리포트 10개 ({cnt.get('P5 예시리포트 10개', 0)}행) — 사람이 쓴 예시 리포트(고리별 1개)를 섹션 단위로. AI가 이 문체를 따라 쓰므로 톤 기준이 됩니다.", None),
        ("", None),
        ("3. 검수 기준 (체크리스트)", "h"),
        ("□ 상대를 판정하거나 낙인찍지 않는가 — '회피형/불안형', '○○ 패턴입니다', '문제입니다' 같은 단정 금지. 상대 모습은 늘 '내 눈에 비친', '~할 때가 있을 수 있습니다'.", None),
        ("□ 헤어지라 / 계속 만나라 / 참으라·견디라는 조언이 없는가 — 결론은 늘 작은 한 걸음.", None),
        ("□ 통제·감시(위치 공유 요구, 휴대폰 확인 등)를 애정이나 해법으로 쓰지 않았는가 — 이런 행동은 안전 문항에서만 다룹니다.", None),
        ("□ 안전(D19) 문구 — 안전 문항·안내·연락처·고지문이 겁주지 않으면서 분명한가, 혼자 감당하지 않도록 이끄는가. 연락처(1366·112) 최신 여부도 봐 주세요.", None),
        ("□ 합쇼체 톤 — 안내·설명은 '~습니다/~입니다', 제안은 '~해 보세요'. 따옴표 안 대사와 쏠_마을_이야기('~했다' 서술)·부탁해_볼_말(반말 대사)은 예외.", None),
        ("□ 유형 이론과 맞는가 — 역량(기대기·믿기·선 지키기·말하기·회복하기)·방식(다가가기·맞춰주기·거리두기·조율하기)과 고리 설명이 어긋나지 않는지. '유형 참고' 시트를 옆에 두고 보세요.", None),
        ("□ 민감성 — 상처가 될 수 있는 표현, 한쪽만 탓하는 흐름, 특정 성별·관계 형태를 가정하는 표현, 없는 통계·연구 수치가 없는가.", None),
        ("", None),
        ("4. 칸 채우는 법 (크림색 칸만)", "h"),
        ("상태: 목록에서 고르기 — OK(그대로 사용) / 수정(수정안대로 바꿈) / 보류(판단 보류·논의 필요). 비워 두면 '미검수'로 셉니다.", None),
        ("수정안: '수정'일 때 고친 문장 전체를 적어 주세요(일부만 적지 말고 문장 전체).", None),
        ("메모: 이유나 질문. '보류'일 때는 메모를 꼭 남겨 주세요.", None),
        ("중괄호 자리표시자 {애칭}, {애칭|은}, {A|이}, {이름} 등은 지우거나 바꾸지 마세요. 조사는 시스템이 받침에 맞춰 붙입니다('은(는)' 병기 금지). 바뀌면 반영되지 않습니다.", None),
        ("ID·위치·원문 칸과 숨긴 열은 고치지 마세요. ID가 데이터 위치라 '수정' 행만 자동으로 데이터에 반영됩니다(P4 일부·P5는 문서 파일이라 수동 반영).", None),
        ("'진행 현황' 시트에서 시트별 OK/수정/보류/미검수 수가 자동으로 집계됩니다. 각 시트 머리글의 필터로 유형·쌍별로 좁혀 볼 수 있습니다.", None),
        ("", None),
        ("5. 예상 분량", "h"),
        ("P1 전체(1-1~1-3)를 먼저 끝내면 출시에 필요한 무료 화면이 모두 확인됩니다. P1-3·P3은 행이 많으니, 시간이 부족하면 같은 유형으로 시작하는 방향(예: 수달→…) 몇 개를 표본으로 먼저 보고 반복되는 문제를 메모로 알려 주셔도 됩니다.", None),
    ]
    for text, kind in lines:
        g.append([text])
        c = g.cell(g.max_row, 1)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        c.font = Font(name="Arial", size=14 if kind == "title" else 11, bold=kind in ("title", "h"),
                      color="013566" if kind in ("title", "h") else "000000")
    # 예상 분량 표
    g.append(["시트", "행 수"])
    for n, c in cnt.items():
        g.append([n, c])
    g.append(["합계", sum(cnt.values())])
    g.column_dimensions["A"].width = 100; g.column_dimensions["B"].width = 10
    wb.move_sheet("진행 현황", offset=1 - wb.sheetnames.index("진행 현황"))
    wb.save(a.xlsx)
    print("시트별 행 수:")
    for n, c in cnt.items(): print(f"  {n}: {c}")
    print(f"  합계: {sum(cnt.values())}")
    if a.hapsho:
        print(f"합쇼체 확인 필요 {hap_total}행 → P1~P3 표시 {flagged['P1~P3']}, P5 표시 {flagged['P5']}, P4 {flagged['P4']}행(같은 문장 합침), 제외 {len(dropped)}")
        for d in dropped: print("  제외:", *d)
    print("저장:", a.xlsx)


if __name__ == "__main__":
    main()
