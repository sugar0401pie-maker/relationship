#!/usr/bin/env node
// 출시 전 AI 리포트 사전 테스트
// node run_pretest.mjs [--dry-run] [--case N] [--no-style] [--model gpt-6-sol]
// OPENAI_API_KEY는 환경 변수에서만 읽고, 로그·파일에 남기지 않음.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildRequest, buildContext, buildVars, PAID_FIELDS, UNRESOLVED_RE } from "./build_input.mjs";
import { validate } from "./validate.mjs";

const HERE = new URL("./", import.meta.url);
const OUT = new URL("./out/", HERE);
const API = "https://api.openai.com/v1/responses";
const MAX_OUTPUT_TOKENS = 25000;
const TIMEOUT_MS = 10 * 60 * 1000;

// ---------- 인자 ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DRY = flag("--dry-run");
const NO_STYLE = flag("--no-style");
const MODEL = opt("--model", "gpt-6-sol");
const ONLY = opt("--case", null);
if (flag("--help") || flag("-h")) {
  console.log("node run_pretest.mjs [--dry-run] [--case N] [--no-style] [--model gpt-6-sol]");
  process.exit(0);
}

const ALL = JSON.parse(readFileSync(new URL("cases.json", HERE), "utf8"));
const cases = ONLY ? ALL.filter((c) => c.sample_no === Number(ONLY) || c.id === ONLY) : ALL;
if (!cases.length) { console.error(`케이스 없음: ${ONLY}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const KEY = process.env.OPENAI_API_KEY;
if (!DRY && !KEY) { console.error("OPENAI_API_KEY 환경 변수가 없습니다. (--dry-run으로 프롬프트만 만들 수 있습니다)"); process.exit(1); }

// ---------- API ----------
function extractText(json) {
  if (typeof json?.output_text === "string" && json.output_text.trim()) return json.output_text;
  const parts = [];
  for (const o of json?.output ?? []) {
    if (o?.type && o.type !== "message") continue; // reasoning 등은 건너뜀
    for (const c of o?.content ?? []) {
      if (typeof c?.text === "string") parts.push(c.text);
      else if (typeof c?.text?.value === "string") parts.push(c.text.value);
    }
  }
  return parts.join("");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function callOnce(req) {
  const body = { model: MODEL, instructions: req.system, input: req.user, max_output_tokens: MAX_OUTPUT_TOKENS };
  for (let attempt = 0; ; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const t0 = Date.now();
    let res, json;
    try {
      res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify(body), signal: ac.signal,
      });
      json = await res.json().catch(() => ({}));
    } catch (e) {
      clearTimeout(timer);
      if (attempt < 2) { await sleep(3000 * (attempt + 1)); continue; }
      throw new Error(`네트워크 오류: ${e.name === "AbortError" ? "시간 초과" : e.message}`);
    }
    clearTimeout(timer);
    const latency = Date.now() - t0;
    if ((res.status === 429 || res.status >= 500) && attempt < 2) { await sleep(5000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error?.message ?? "응답 오류"}`);
    return { json, latency, text: extractText(json), status: json.status, usage: json.usage ?? null };
  }
}

// incomplete → 1회 재호출, 검증 실패 → 1회 재생성 (마스터 스펙 7장 / 디저트 스펙 8.5)
async function generate(req, ctx) {
  const log = [];
  let totalLatency = 0;
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, seen: false };
  const addUsage = (u) => { if (!u) return; usage.seen = true; for (const k of ["input_tokens", "output_tokens", "total_tokens"]) usage[k] += u[k] ?? 0; };
  let last = null;
  for (let gen = 1; gen <= 2; gen++) {
    let r = await callOnce(req); totalLatency += r.latency; addUsage(r.usage);
    log.push(`gen${gen}: status=${r.status} ${r.latency}ms`);
    if (r.status === "incomplete") {
      log.push(`  incomplete(${r.json?.incomplete_details?.reason ?? "?"}) → 재호출`);
      r = await callOnce(req); totalLatency += r.latency; addUsage(r.usage);
      log.push(`gen${gen}b: status=${r.status} ${r.latency}ms`);
    }
    const v = validate(r.text, ctx);
    last = { text: r.text, v, status: r.status, gen };
    log.push(`  검증 ${v.pass ? "통과" : "실패: " + v.checks.filter((c) => !c.pass).map((c) => c.id).join(",")}`);
    if (v.pass && r.status !== "incomplete") break;
  }
  return { ...last, latency: totalLatency, usage: usage.seen ? usage : null, log };
}

// ---------- 실행 ----------
const RULE_IDS = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "X1", "X2"];
const rows = [];
for (const c of cases) {
  const req = buildRequest(c, { useStyle: !NO_STYLE });
  const ctx = buildContext(c);
  const { r, lead, pairPaid } = buildVars(c);
  const sys = req.system.length, usr = req.user.length;
  const unresolved = [...new Set([...(req.system.match(UNRESOLVED_RE) || []), ...(req.user.match(UNRESOLVED_RE) || [])])];
  // 케이스가 예시 리포트 입력 요약과 맞는지
  const e = c.expect;
  const mism = [];
  if (r.myType !== e.my_type) mism.push(`내 유형 ${r.myType}≠${e.my_type}`);
  if (r.pType !== e.partner_type) mism.push(`그 사람 유형 ${r.pType}≠${e.partner_type}`);
  if (r.mismatch.key !== e.mismatch.key || r.mismatch.competency !== e.mismatch.competency) mism.push("엇갈림 불일치");
  if (r.balance?.key !== e.balance) mism.push("저울 불일치");
  if (r.innerOuter.key !== e.inner_outer.key || r.innerOuter.competency !== e.inner_outer.competency) mism.push("속·겉 불일치");
  // 무료 문장(4번 앞 2줄)에 유료 재료가 섞이지 않았는지
  const leak = PAID_FIELDS.filter((f) => pairPaid[f] && lead.includes(pairPaid[f].slice(0, 20)));
  const row = { id: c.id, label: c.label, style: !NO_STYLE, sys, usr, unresolved, mism, leak };

  if (DRY) {
    writeFileSync(new URL(`${c.id}.prompt.txt`, OUT), `===== SYSTEM (${sys}자) =====\n${req.system}\n\n===== USER (${usr}자) =====\n${req.user}\n`);
    console.log(`${c.id} ${c.label}  system ${sys}자 / user ${usr}자  미해결 {}: ${unresolved.length ? unresolved.join(" ") : "없음"}${mism.length ? "  ⚠ " + mism.join(", ") : ""}`);
    rows.push(row);
    continue;
  }

  process.stdout.write(`${c.id} ${c.label} … `);
  try {
    const g = await generate(req, ctx);
    writeFileSync(new URL(`${c.id}.md`, OUT), g.text);
    writeFileSync(new URL(`${c.id}.validation.json`, OUT), JSON.stringify({ ...g.v, log: g.log }, null, 2));
    Object.assign(row, { status: g.status, pass: g.v.pass, gen: g.gen, chars: g.v.chars, latency: g.latency, usage: g.usage, checks: g.v.checks });
    console.log(`${g.v.pass ? "통과" : "실패"} (${g.v.chars}자, ${g.latency}ms, 생성 ${g.gen}회)`);
  } catch (err) {
    Object.assign(row, { error: err.message });
    console.log(`오류: ${err.message}`);
  }
  rows.push(row);
}

// ---------- 요약 ----------
const csvEsc = (x) => { const s = String(x ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
let csv, md;
if (DRY) {
  csv = ["case,label,style_example,system_chars,user_chars,total_chars,unresolved,case_mismatch,paid_leak"]
    .concat(rows.map((r) => [r.id, r.label, r.style, r.sys, r.usr, r.sys + r.usr, r.unresolved.join(" "), r.mism.join(" "), r.leak.join(" ")].map(csvEsc).join(","))).join("\n");
  md = [`# 사전 테스트 — dry-run (네트워크 호출 없음)`, ``, `모델 ${MODEL} · style_example ${NO_STYLE ? "없음" : "있음"}`, ``,
    `| 케이스 | 조합 | system | user | 합계 | 미해결 {} | 케이스 일치 |`, `|---|---|---:|---:|---:|---|---|`,
    ...rows.map((r) => `| ${r.id} | ${r.label} | ${r.sys} | ${r.usr} | ${r.sys + r.usr} | ${r.unresolved.join(" ") || "없음"} | ${r.mism.join(", ") || "일치"} |`)].join("\n");
} else {
  csv = [["case", "label", "style_example", "status", "pass", "generations", ...RULE_IDS, "chars", "latency_ms", "input_tokens", "output_tokens", "total_tokens", "error"].join(",")]
    .concat(rows.map((r) => {
      const ck = Object.fromEntries((r.checks || []).map((x) => [x.id, x.pass ? "O" : "X"]));
      return [r.id, r.label, r.style, r.status, r.pass, r.gen, ...RULE_IDS.map((id) => ck[id] ?? ""), r.chars, r.latency,
        r.usage?.input_tokens, r.usage?.output_tokens, r.usage?.total_tokens, r.error].map(csvEsc).join(",");
    })).join("\n");
  const passN = rows.filter((r) => r.pass).length;
  md = [`# 사전 테스트 결과`, ``, `모델 ${MODEL} · style_example ${NO_STYLE ? "없음" : "있음"} · 통과 ${passN}/${rows.length}`, ``,
    `| 케이스 | 결과 | 생성 | ${RULE_IDS.join(" | ")} | 글자 | 지연(ms) | 토큰(in/out) |`,
    `|---|---|---|${RULE_IDS.map(() => "---").join("|")}|---:|---:|---|`,
    ...rows.map((r) => {
      if (r.error) return `| ${r.id} | 오류 | - | ${RULE_IDS.map(() => "").join(" | ")} | - | - | ${r.error} |`;
      const ck = Object.fromEntries(r.checks.map((x) => [x.id, x.pass ? "O" : "X"]));
      return `| ${r.id} | ${r.pass ? "통과" : "실패"} | ${r.gen} | ${RULE_IDS.map((id) => ck[id]).join(" | ")} | ${r.chars} | ${r.latency} | ${r.usage ? `${r.usage.input_tokens}/${r.usage.output_tokens}` : "-"} |`;
    }),
    ``, `## 실패 상세`, ``,
    ...rows.filter((r) => r.checks && !r.pass).flatMap((r) => [`### ${r.id} ${r.label}`, ...r.checks.filter((x) => !x.pass).map((x) => `- ${x.id} ${x.name}: ${x.detail}`), ``]),
    `규칙: R1 헤더 / R2 분량 / R3 말머리·첫째둘째셋째 / R4 마지막 안내 문단 / R5 금지어 / R6 학자 이름·영어 이론명 / R7 해요체·끝 표현 3연속 / R8 문단 5문장 / R9 고르셨 3회 / X1 pair_relations 복사 / X2 동물·물 비유`,
  ].join("\n");
}
writeFileSync(new URL("summary.csv", OUT), "﻿" + csv + "\n");
writeFileSync(new URL("summary.md", OUT), md + "\n");
console.log(`\n→ out/summary.md, out/summary.csv`);
const bad = rows.some((r) => r.unresolved.length || r.mism.length || r.leak.length);
if (bad) { console.error("⚠ 미해결 자리표시자 / 케이스 불일치 / 유료 재료 노출이 있습니다."); process.exitCode = 1; }
