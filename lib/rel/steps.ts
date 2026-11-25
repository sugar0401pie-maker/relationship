// 장면 하나의 화면 내용(서버가 문구를 다 렌더해서 보낸다 — 브라우저는 데이터 파일 전체를 받지 않는다).
// 문항·보기·노출 순서는 데이터 그대로(마스터 스펙 3장: 문구·점수·순서 임의 변경 금지, 보기 순서는 display_order 고정).
// 점수는 화면에 보내지 않는다 — 보기는 원래 배열 위치(key)로만 주고받고, 서버가 점수로 바꾼다.
import * as S from "./scoring.js";
import { josa } from "./josa.js";
import { P1_STEPS, P2_STEPS, M1_STEPS, M2_STEPS, TOTAL_SCENES, confirmOptions, prevStep, sceneNumber, sequence, type Answers, type Item, type ModeScene, type RelData } from "./flow.ts";
import { R, cleanContacts, type Vars } from "./text.ts";

export type Relationship = "연애" | "결혼·동거";
export type Option = { key: string; text: string; sub?: string };
export type StepScreen = {
  step: string;
  kind: "intro" | "comp" | "mode" | "confirm";
  part: 1 | 2;
  sceneNo: number | null;
  total: number;
  heading?: string;
  scene?: string;
  question?: string;
  body?: string[];
  options: Option[];
  dontKnow: boolean;
  selected: string | null;
  prev: string | null;
  hint?: string;
  safety?: { notice: string; contacts: string };
};

type UiCopy = Record<string, string | string[]>;
type Family = { 역량: string; 묻는것: string };
export type FullData = RelData & { ui_copy: UiCopy; families: Family[]; result_flow: Record<string, unknown> };

const DONT_KNOW = "잘 모르겠어요"; // 마스터 스펙 3.3 — 2부 모든 문항에 추가하는 보기(문구 고정)

const married = (rel: Relationship) => rel === "결혼·동거";

function compItem(step: string, D: RelData): Item {
  if (step.startsWith("p1-")) {
    const id = D.part1_order[P1_STEPS.indexOf(step)];
    return D.part1_competency.find((x) => x.id === id)!;
  }
  return D.part2_competency[P2_STEPS.indexOf(step)];
}

export function modeScenes(part: 1 | 2, comp: string, D: RelData): ModeScene[] {
  return D.mode_scenes.filter((m) => m.부 === `${part}부` && m.역량 === comp);
}

/** 역량 장면의 key(원래 배열 위치) → 점수 */
export function scoreForKey(step: string, key: string, D: RelData): number | null {
  const it = compItem(step, D);
  const b = it?.보기[Number(key)];
  return b ? b.score : null;
}

export function buildStep(step: string, a: Answers, D: FullData, who: { name: string; nickname: string; relationship: Relationship }): StepScreen {
  const vars: Vars = { 이름: who.name, 애칭: who.nickname };
  const ui = D.ui_copy;
  const { d } = sequence(a, D);
  const base = { step, sceneNo: sceneNumber(step), total: TOTAL_SCENES, prev: prevStep(step, a, D), dontKnow: false, selected: null as string | null };

  if (step === "intro1" || step === "intro2") {
    const intro = step === "intro1" ? (ui.part1_intro as string) : (ui.part2_intro as string);
    return {
      ...base, kind: "intro", part: step === "intro1" ? 1 : 2, options: [],
      heading: step === "intro1" ? "1부 · 나" : `2부 · ${R(ui.partner_title as string, vars)}`,
      body: [R(intro, vars)],
      selected: a[step] === true ? "start" : null,
    };
  }

  if (step.startsWith("p1-") || step.startsWith("p2-")) {
    const part = step.startsWith("p1-") ? 1 : 2;
    const it = compItem(step, D);
    const scene = married(who.relationship) && it.결혼 ? it.결혼 : it.장면;
    const options: Option[] = it.display_order.map((idx) => {
      const ov = married(who.relationship) ? it.결혼_보기_override?.[String(idx)] : undefined;
      return { key: String(idx), text: R(ov || it.보기[idx].text, vars) };
    });
    const v = a[step];
    let selected: string | null = null;
    if (typeof v === "number") selected = String(it.보기.findIndex((b) => b.score === v));
    else if (v === null && part === 2 && Object.prototype.hasOwnProperty.call(a, step)) selected = "dk";
    return {
      ...base, kind: "comp", part, options, selected,
      scene: R(scene, vars),
      question: part === 1 ? it.질문 : undefined,
      dontKnow: part === 2,
    };
  }

  if (step.startsWith("m1-") || step.startsWith("m2-")) {
    const part = step.startsWith("m1-") ? 1 : 2;
    const comp = part === 1 ? d.myComp! : d.pComp!;
    const sc = modeScenes(part, comp, D)[(part === 1 ? M1_STEPS : M2_STEPS).indexOf(step)];
    const scene = married(who.relationship) && sc.결혼 ? sc.결혼 : sc.장면;
    const options: Option[] = sc.display_order.map((mode) => {
      const ov = married(who.relationship) ? sc.결혼_보기_override?.[mode] : undefined;
      return { key: mode, text: R(ov || sc.보기[mode], vars) };
    });
    const v = a[step];
    let selected: string | null = null;
    if (typeof v === "string" && v.startsWith(`${comp}|`)) selected = v.slice(comp.length + 1) || (part === 2 ? "dk" : null);
    return {
      ...base, kind: "mode", part, options, selected,
      scene: R(scene, vars),
      dontKnow: part === 2,
      hint: step === "m2-4" ? ((D.result_flow.test_end_hint as string) ?? undefined) : undefined,
    };
  }

  // 확인 화면(동점·모두 편안·판단 부족 — 무작위로 고르지 않고 사용자가 고른다)
  const opts = confirmOptions(step, d);
  const v = a[step];
  const selected = typeof v === "string" && opts.includes(v) ? v : null;
  if (step === "c1-comp" || step === "c2-comp") {
    const fam = (c: string) => D.families.find((f) => f.역량 === c);
    const options = opts.map((c) => ({ key: c, text: c, sub: fam(c) ? R(fam(c)!.묻는것, vars) : undefined }));
    let body: string[];
    if (step === "c1-comp") {
      const low = d.self!.lowest;
      if (low.mode === "all_high") body = [R(ui.confirm_comp_allhigh as string, vars)];
      else if (opts.length === 2) body = [R(ui.confirm_comp_tie as string, { ...vars, 역량A: opts[0], 역량B: opts[1] })];
      // 세 개 이상 동점: 같은 문장 틀로 이름만 늘어놓는다
      else body = [`${opts.map((o) => `'${o}'`).join(", ")}${josa(opts[opts.length - 1], "이")} 비슷해 보입니다. 지금 더 마음이 쓰이는 쪽은?`];
    } else {
      body = d.partner!.lowest.mode === "insufficient" ? [R(ui.partner_insufficient as string, vars), R(ui.confirm_partner as string, vars)] : [R(ui.confirm_partner as string, vars)];
    }
    return { ...base, kind: "confirm", part: step === "c1-comp" ? 1 : 2, options, selected, body };
  }
  // 방식 확인: 그 역량 첫 번째 방식 장면의 해당 보기를 설명으로 붙인다
  const part = step === "c1-mode" ? 1 : 2;
  const comp = part === 1 ? d.myComp! : d.pComp!;
  const sc = modeScenes(part, comp, D)[0];
  const options = opts.map((m) => ({ key: m, text: m, sub: R((married(who.relationship) && sc.결혼_보기_override?.[m]) || sc.보기[m], vars) }));
  return {
    ...base, kind: "confirm", part, options, selected,
    body: [R((part === 1 ? ui.confirm_mode : ui.confirm_partner) as string, vars)],
    hint: part === 2 ? ((D.result_flow.test_end_hint as string) ?? undefined) : undefined,
  };
}

/** 화면에서 보낸 값 → 저장할 응답. 잘못된 값이면 null(저장 안 함). */
export function answerFromInput(step: string, value: string, a: Answers, D: RelData): { ok: true; v: number | string | boolean | null } | { ok: false } {
  const { d } = sequence(a, D);
  if (step === "intro1" || step === "intro2") return value === "start" ? { ok: true, v: true } : { ok: false };
  if (step.startsWith("p1-") || step.startsWith("p2-")) {
    if (step.startsWith("p2-") && value === "dk") return { ok: true, v: null };
    const s = scoreForKey(step, value, D);
    return s == null ? { ok: false } : { ok: true, v: s };
  }
  if (step.startsWith("m1-") || step.startsWith("m2-")) {
    const comp = step.startsWith("m1-") ? d.myComp : d.pComp;
    if (!comp) return { ok: false };
    if (step.startsWith("m2-") && value === "dk") return { ok: true, v: `${comp}|` };
    return (S.MODES as readonly string[]).includes(value) ? { ok: true, v: `${comp}|${value}` } : { ok: false };
  }
  return confirmOptions(step, d).includes(value) ? { ok: true, v: value } : { ok: false };
}

export const DONT_KNOW_LABEL = DONT_KNOW;
export const safetyCopy = (D: FullData) => ({ notice: D.ui_copy.safety_notice_start as string, contacts: cleanContacts(D.ui_copy.safety_contacts as string) });
