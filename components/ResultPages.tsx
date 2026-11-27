"use client";

// 결과 10쪽(옆으로 넘겨 보기, 쪽마다 주소 /result/{결과}/{쪽}) — 결과화면_결제유도_v2.md + 결제후_리포트화면_v1.md 시안 구성.
// 클로즈드 세션 배포본(owner 2026-11-25): 결제 없이 전체 열람. 4쪽은 결제 상자 대신 [카드 뒤집기], 5~9쪽은 AI 리포트 본문.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "./Shell";
import Radar from "./Radar";
import { api } from "@/lib/client/api";
import { buildCompare, type CompareData } from "@/lib/rel/compare";
import { preloadKakao, shareKakaoCard } from "@/lib/client/kakaoShare";
import KakaoTalkLogo from "./share/KakaoTalkLogo";
import type { ResultPayload } from "@/lib/server/sessions";
import type { Block, TypeCard as TC } from "@/lib/rel/pages";

const PAGES = 12;
const SOWELLA_URL = "https://app.ssolwellnesshouse.com";
const cache = new Map<string, ResultPayload>(); // 쪽을 넘길 때마다 다시 받지 않게(리포트가 만들어지는 중이면 따로 다시 묻는다)

// AI 글 안의 인용 보기('…'를 고르셨습니다) → 하늘색 칩(시안 .pick)
function withPicks(t: string): React.ReactNode {
  const parts = t.split(/(‘[^’]+’|'[^']+')(?=를 고르셨|을 고르셨| 쪽으로 보였)/);
  return parts.length === 1 ? t : parts.map((x, j) => (j % 2 ? <span key={j} className="pick">{x}</span> : x));
}

// 문단의 첫 문장을 굵게(owner 2026-11-25). 첫 문장 = 따옴표 밖에서 '다·요·까' + 마침표·물음표로 처음 끝나는 곳까지.
function firstBold(t: string): React.ReactNode {
  const m = t.match(/^(?:[^"“‘']|"[^"]*"|“[^”]*”|‘[^’]*’|'[^']*')*?(?:다|요|까)[.?!]['"’”]?(?=\s|$)/);
  if (!m) return withPicks(t);
  const head = m[0], rest = t.slice(head.length);
  return <><b className="first">{head}</b>{withPicks(rest)}</>;
}

const Bold = ({ parts }: { parts: { b: boolean; t: string }[] }) => <>{parts.map((p, i) => (p.b ? <b key={i}>{p.t}</b> : <span key={i}>{p.t}</span>))}</>;

function TypeCard({ c, tag }: { c: TC; tag: string }) {
  return (
    <div className="tcard">
      <span className="tag">{tag}</span>
      {c.hiddenLine && <b style={{ color: "var(--navy)" }}>{c.hiddenLine}</b>}
      {c.img && <img src={c.img} alt={c.name} />}
      <span className="tname">{c.name}</span>
      <div className="axis"><span className="chip on">{c.comp}</span><span className="chip">{c.mode}</span><span className="chip">{c.family}</span></div>
      <p className="desc">{c.desc}</p>
      {c.sentence && <p className="small">{c.sentence}</p>}
      {c.neighbor && <p className="small">{c.neighbor}</p>}
    </div>
  );
}

function Blocks({ blocks, moments, nickname = "", leadFirst }: { blocks: Block[]; moments?: boolean; nickname?: string; leadFirst?: boolean }) {
  const stepTitle = ["내가 해 볼 것", `${nickname}에게 부탁할 것`, "둘이 함께 정할 것"];
  // 말머리(•) 줄 뒤 문단은 흰 상자로 묶는다(6·7쪽 '순간 3개' 모양). 첫째/둘째/셋째는 번호 단계로.
  const out: React.ReactNode[] = [];
  let box: React.ReactNode[] | null = null;
  let title = "";
  const flush = () => {
    if (box) out.push(<div className="moment" key={`m${out.length}`}><h3>{title}</h3>{box}</div>);
    box = null;
  };
  blocks.forEach((b, i) => {
    if (b.t === "item") {
      flush();
      if (moments) { box = []; title = b.text; } else out.push(<h3 key={i} style={{ marginTop: 6 }}>• {b.text}</h3>);
    } else if (b.t === "step") {
      flush();
      // "첫째, … 이렇게 제안하는 이유는 …" → 본문과 이유(회색)로 나눈다(시안 8쪽)
      const body = b.text.replace(/^(첫째|둘째|셋째),\s*/, "");
      const k = body.indexOf("이렇게 제안하는 이유는");
      out.push(
        <div className="step" key={i}><span className="n">{b.n}</span><div>
          <h3>{stepTitle[b.n - 1]}</h3>
          <p>{firstBold(k > 0 ? body.slice(0, k).trim() : body)}</p>
          {k > 0 && <p className="why">{body.slice(k).replace(/^이렇게 제안하는 이유는\s*/, "")}</p>}
        </div></div>,
      );
    } else {
      const text = b.parts.map((x) => x.t).join("");
      const p = leadFirst && i === 0 ? <p key={i} className="lead"><b>{text}</b></p> : <p key={i}>{firstBold(text)}</p>;
      if (box) box.push(p); else out.push(p);
    }
  });
  flush();
  return <div className="prose">{out}</div>;
}

export default function ResultPages({ id, page, initial, base = "/result" }: { id: string; page: number; initial?: ResultPayload; base?: string }) {
  const router = useRouter();
  const [data, setData] = useState<ResultPayload | null>(initial ?? cache.get(id) ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const kicked = useRef(0);
  // 10쪽에서 고른 상대 유형 두 개(유형 이름만). owner 2026-11-27 결정으로 결과에 저장한다 — 다른 기기에서도 비교가 이어지게.
  // 저장된 값이 있으면 그것을, 없으면 이 기기에 남긴 값을 쓴다. 서버 저장이 안 되면(마이그레이션 전 등) 이 기기 값으로 계속 비교.
  const [pick, setPick] = useState<[string, string]>(["", ""]);
  const serverPick = data?.partnerPick ?? null;
  useEffect(() => {
    if (serverPick) { queueMicrotask(() => setPick(serverPick)); return; }
    try {
      const v = JSON.parse(localStorage.getItem(`rel-pc-${id}`) ?? "null");
      if (Array.isArray(v) && v.length === 2) queueMicrotask(() => setPick([String(v[0] ?? ""), String(v[1] ?? "")]));
    } catch { /* 저장소를 못 쓰면 매번 고른다 */ }
  }, [id, serverPick]);
  const choose = (v: [string, string]) => {
    setPick(v);
    try { localStorage.setItem(`rel-pc-${id}`, JSON.stringify(v)); } catch { /* 무시 */ }
    if (initial || !v[0] || !v[1]) return;
    const c = cache.get(id);
    if (c) cache.set(id, { ...c, partnerPick: v });
    void api(`/api/rel/result/${id}/partner`, { method: "POST", body: { self: v[0], view: v[1] } }).catch(() => {});
  };

  const load = useCallback(async () => {
    try {
      const r = await api<ResultPayload>(`/api/rel/result/${id}`);
      cache.set(id, r);
      setData(r);
      return r;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오지 못했습니다.");
      return null;
    }
  }, [id]);

  useEffect(() => {
    if (initial || cache.get(id)) return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [id, load, initial]);

  // 리포트가 아직이면 5초마다 확인. 'none'(아직 시작 전·1회차 검증 실패 뒤)이면 만들기를 이어서 부탁한다.
  const status = data?.report.status;
  useEffect(() => {
    if (initial || !status || status === "ready" || status === "failed") return;
    const t = setInterval(async () => {
      const r = await load();
      if ((r?.report.status === "none" || r?.report.status === "generating") && kicked.current < 40) {
        kicked.current++;
        void api(`/api/rel/result/${id}/report`, { method: "POST", body: {} }).catch(() => {});
      }
    }, 5000);
    return () => clearInterval(t);
  }, [status, id, load, initial]);

  const go = (n: number) => { if (n >= 1 && n <= PAGES) { router.push(`${base}/${id}/${n}`); window.scrollTo(0, 0); } };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "ArrowRight") go(page + 1); if (e.key === "ArrowLeft") go(page - 1); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const touch = useRef<number | null>(null);
  useEffect(() => { if (page === 4 || page === 10 || page === 12) preloadKakao(); }, [page]);

  async function retry() {
    await api(`/api/rel/result/${id}/report`, { method: "POST", body: { retry: true } }).catch(() => {});
    kicked.current = 0;
    cache.delete(id);
    setData((d) => (d ? { ...d, report: { ...d.report, status: "generating", canRetry: false } } : d));
  }

  // [카카오톡으로 공유]: 카카오톡 카드(그림 + 이야기 한 줄 + [당신이 보는 우리는?] → 테스트 첫 화면)를 보낸다.
  // 카카오 키가 없거나 도메인이 등록되지 않아 실패하면 휴대폰 공유창 → 링크 복사 순으로 넘어간다.
  async function share() {
    if (!data) return;
    const p4 = data.view.pages.p4;
    const url = window.location.origin + "/";
    const sent = await shareKakaoCard({
      title: p4.shareText,
      description: "강에 사는 나, 바다에 사는 너 — 우리는 어떤 바다 친구일까?",
      imageUrl: window.location.origin + p4.shareImage,
      imageWidth: 800,
      imageHeight: p4.shareImage.includes("/pairs/") ? 1000 : 800,
      url,
      button: p4.shareButton,
    });
    if (sent) return;
    const full = `${p4.shareText}\n강에 사는 나, 바다에 사는 너 — 우리는 어떤 바다 친구일까?\n${url}`;
    try {
      if (navigator.share) await navigator.share({ title: "강에 사는 나, 바다에 사는 너", text: full });
      else { await navigator.clipboard.writeText(full); setToast("링크를 복사했습니다"); setTimeout(() => setToast(null), 1800); }
    } catch { /* 공유 창을 닫은 경우 */ }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.origin); setToast("링크를 복사했습니다"); } catch { setToast("복사하지 못했습니다"); }
    setTimeout(() => setToast(null), 1800);
  }
  function saveImage(src: string) {
    const a = document.createElement("a");
    a.href = src;
    a.download = "ssol-village.jpg";
    a.click();
  }
  const card = (c: (typeof data extends null ? never : NonNullable<typeof data>)["view"]["pages"]["p9"]["cards"][number], n?: number) => (
    <article key={c.id + c.slot + (n ?? "")} className={`pc${c.together ? " together" : ""}`}>
      <header><b>{c.together ? `함께 ${n}` : c.slot}</b><span>{c.minutes}분 · {c.format}</span></header>
      <div className="body">
        <p className="ttl">{c.title}</p>
        <p className="row">{c.how}</p>
        <p className="row"><span className="lbl">언제</span>{c.cue}</p>
        {c.role && <p className="role">{c.role}</p>}
        <p className="why">{c.why}</p>
        {!c.together && <label className="check"><input type="checkbox" />해 봤어요</label>}
        <p className="src">쏘웰라 실천 DB · {c.id}</p>
      </div>
    </article>
  );

  const cmp = data && pick[0] && pick[1] ? buildCompare(data.view.pages.compare, pick[0], pick[1]) : null;

  // [테스트 보내기]: 연인에게 테스트 자체를 카카오톡으로(결과·이름은 넣지 않음). 실패하면 공유창 → 링크 복사.
  async function invite() {
    const url = window.location.origin + "/";
    const title = "강에 사는 나, 바다에 사는 너";
    const description = "나와 내 눈에 비친 연인은 어떤 바다 친구일까? 38개 장면으로 알아보는 쏠 마을 관계 테스트";
    if (await shareKakaoCard({ title, description, imageUrl: window.location.origin + "/images/intro.jpg", imageWidth: 800, imageHeight: 1000, url, button: "테스트 하러 가기" })) return;
    try {
      if (navigator.share) await navigator.share({ title, text: `${description}\n${url}` });
      else { await navigator.clipboard.writeText(url); setToast("링크를 복사했습니다"); setTimeout(() => setToast(null), 1800); }
    } catch { /* 닫은 경우 */ }
  }

  if (err) return <Shell><p className="err-box">{err}</p></Shell>;
  if (!data) return <Shell><div className="wait"><div className="wave-dot" aria-label="불러오는 중" /></div></Shell>;
  const v = data.view, P = v.pages;
  const img = (n: number) => P.images[n - 5];
  const ai = data.report.sections;
  const nextLabel = page === 3 ? P.p3.next : page === 8 ? "실천 카드 보기" : page === 9 ? `${v.nickname} 결과와 맞춰 보기` : page === PAGES ? "처음으로" : "다음";

  const aiPage = (no: 4 | 5 | 6 | 7 | 8, moments: boolean) => (
    <>
      <h1>{P.ai[no].title}</h1>
      {img(no + 1) && <figure className="illus"><img src={img(no + 1)!.src} alt={img(no + 1)!.alt} /></figure>}
      {no === 4 && <p><b style={{ color: "var(--navy)" }}>{P.leadLines.split(/(?<=다\.)\s/)[0]}</b> {P.leadLines.split(/(?<=다\.)\s/).slice(1).join(" ")}</p>}
      {ai?.[no] ? <Blocks blocks={ai[no]} moments={moments} nickname={v.nickname} leadFirst={no === 7} /> : <ReportWait r={data.report} teaser={P.ai[no].teaser} onRetry={retry} />}
      {no === 6 && ai?.[no] && <p className="small">어디까지나 내 시선으로 본 모습입니다.</p>}
    </>
  );

  let body: React.ReactNode = null;
  if (page === 1) body = (
    <>
      <p className="lead"><Bold parts={P.p1.intro} /></p>
      <h1>{P.p1.title}</h1>
      <TypeCard c={P.p1.card} tag="첫 번째 장 · 나" />
      <div className="prose">{P.p1.free.split(/(?<=다\.)\s+(?=다만)/).map((t) => <p key={t}>{firstBold(t)}</p>)}</div>
      <div className="sw">
        <div><h4>잘하는 것</h4><ul>{P.p1.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>
        <div><h4>자주 걸리는 것</h4><ul>{P.p1.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul></div>
      </div>
      {P.p1.consistency.map((c) => <p key={c} className="small">{c}</p>)}
      <p className="small">관련 이론: {P.p1.theory}</p>
    </>
  );
  else if (page === 2) body = (
    <>
      <h1>{P.p2.title}</h1>
      {P.p2.insufficient && <p className="quote">{P.p2.insufficient}</p>}
      <TypeCard c={P.p2.card} tag={`두 번째 장 · ${P.p2.card.who}`} />
      <div className="prose">{P.p2.free.split(/(?<=다\.)\s+(?=다만|어디까지나)/).map((t) => <p key={t} className={t.startsWith("어디까지나") ? "small" : undefined}>{t.startsWith("어디까지나") ? t : firstBold(t)}</p>)}</div>
      <Radar comps={P.p2.radar.comps} me={P.p2.radar.me} partner={P.p2.radar.partner} nickname={v.nickname} />
      {P.p2.unseen.map((u) => <p key={u} className="small">{u}</p>)}
    </>
  );
  else if (page === 3) body = (
    <>
      <h1>{P.p3.title}</h1>
      <div className="three">
        {P.p3.cards.map((c) => (
          <div className="mini" key={c.who}>{c.img && <img src={c.img} alt="" />}<b>{c.name}</b><span>{c.who}</span></div>
        ))}
        <div className="mini meet"><div className="pair">{P.p3.cards.map((c) => c.img && <img key={c.who} src={c.img} alt="" />)}</div><b>만나는 곳</b><span>세 번째 장</span></div>
      </div>
      <div className="two"><p className="first">{P.p3.common}</p><p>{P.p3.diff}</p></div>
      <p>{P.p3.free}</p>
      <div className="box">
        <span className="small">{P.p3.twoTitle}</span>
        <div className="loopname">{P.p3.loopName}</div>
        <dl>
          <dt>계기</dt><dd>{P.p3.trigger}</dd>
          <dt>나의 첫 움직임</dt><dd>{P.p3.myMove}</dd>
          <dt>{v.nickname}의 반응</dt><dd>{P.p3.theirMove}</dd>
        </dl>
        {P.p3.loopNote && <p className="small">{P.p3.loopNote}</p>}
      </div>
      <p className="navyb"><Bold parts={P.p3.lead} /> {P.p3.mesh}</p>
      <p className="lead"><Bold parts={P.p3.stop} /></p>
    </>
  );
  else if (page === 4) body = (
    <>
      <h1>{P.p4.title}</h1>
      {!flipped ? (
        <>
          <div className="cardback" aria-label="세 번째 장 뒷면">쏠</div>
          <p>{P.p4.teaser}</p>
          <button className="btn-navy" onClick={() => setFlipped(true)}>{P.p4.cta}</button>
        </>
      ) : (
        <>
          <div className="scene flip">
            {P.p4.pic ? <img className="art-img" src={P.p4.pic.src} alt={P.p4.pic.alt} /> : P.p4.side && <div className="side2">{P.p4.side.map((s) => <img key={s} src={s} alt="" />)}</div>}
            <div className="cap">
              <span className="kicker">쏠 마을 이야기</span>
              <h2>{P.p4.line}</h2>
              <p>{P.p4.story}</p>
            </div>
          </div>
          <div className="bridge">
            <span className="k">두 사람이 다시 만나는 자리</span>
            <h2>{P.p4.bridge}</h2>
            <div><h3>내가 해 볼 한 걸음</h3><p>{P.p4.myStep}</p></div>
            <div><h3>{v.nickname}에게 부탁해 볼 말</h3><p className="quote">{P.p4.ask}</p></div>
          </div>
          <div>
            <ShareRow onShare={share} onSave={() => P.p4.pic && saveImage(P.p4.pic.src)} onCopy={copyLink} saveLabel="그림 저장" />
            <p className="small" style={{ marginTop: 6 }}>{P.p4.shareNote}</p>
          </div>
        </>
      )}
    </>
  );
  else if (page === 5) body = aiPage(4, false);
  else if (page === 6) body = aiPage(5, true);
  else if (page === 7) body = aiPage(6, true);
  else if (page === 8) body = aiPage(7, false);
  else if (page === 9) body = (
    <>
      <h1>이번 주 실천 카드</h1>
      {img(9) && <figure className="illus"><img src={img(9)!.src} alt={img(9)!.alt} /></figure>}
      {ai?.[8] ? <Blocks blocks={ai[8]} /> : <ReportWait r={data.report} teaser={P.ai[8].teaser} onRetry={retry} />}
      <p className="small">{P.p9.note}</p>
      {P.p9.cards.map((c) => card(c))}
    </>
  );
  else if (page === 10) body = (
    <>
      <h1>{P.p10.title}</h1>
      {img(10) && <figure className="illus"><img src={img(10)!.src} alt={img(10)!.alt} /></figure>}
      <p>{firstBold(P.p10.intro)}</p>
      <div className="pbox">
        <p className="small" style={{ margin: 0 }}>{P.p10.sub}</p>
        <div className="sel">
          <label htmlFor="selSelf">{P.p10.selSelf}</label>
          <TypeSelect id="selSelf" value={pick[0]} onChange={(x) => choose([x, pick[1]])} placeholder={P.p10.placeholder} cmp={P.compare} />
          <label htmlFor="selView">{P.p10.selView}</label>
          <TypeSelect id="selView" value={pick[1]} onChange={(x) => choose([pick[0], x])} placeholder={P.p10.placeholder} cmp={P.compare} />
        </div>
        <button className="go" disabled={!cmp} onClick={() => go(11)}>{P.p10.button}</button>
        <button className="inv" onClick={invite}>{P.p10.invite}</button>
        <p className="small" style={{ margin: 0 }}>{P.p10.inviteNote}</p>
      </div>
    </>
  );
  else if (page === 11) body = (
    <>
      <h1>{P.p11.title}</h1>
      {img(11) && <figure className="illus"><img src={img(11)!.src} alt={img(11)!.alt} /></figure>}
      {!cmp ? (
        <Locked text={P.p11.locked} button={P.p11.lockButton} onGo={() => go(10)} />
      ) : (
        <>
          <div className="four">
            {cmp.cards.map((c) => (
              <div key={c.label} className={`mini${c.other ? " other" : ""}`}><span>{c.label}</span>{c.type.img && <img src={c.type.img} alt="" />}<b>{c.type.name}</b><span>{c.type.comp} × {c.type.mode}</span></div>
            ))}
          </div>
          {[cmp.aboutMe, cmp.aboutPartner].map((g) => (
            <div key={g.head} className="gap">
              <span className="k">{g.head} · {g.label}</span>
              <h3>{g.title}</h3>
              <p>{g.body}</p>
              {g.inside && g.outside && (
                <div className="vs">
                  <p><b>{g.inside.who}</b>{g.inside.text}</p>
                  <p><b>{g.outside.who}</b>{g.outside.text}</p>
                </div>
              )}
              {g.why && <p className="small" style={{ margin: 0 }}>{g.why}</p>}
              {g.projection && <p className="proj">{g.projection}</p>}
            </div>
          ))}
          <div className="loopcmp">{cmp.loops}</div>
          <p className="small" style={{ margin: 0 }}>{P.p11.notJudge}</p>
        </>
      )}
    </>
  );
  else if (page === 12) body = (
    <>
      <h1>{P.p12.title}</h1>
      {img(12) && <figure className="illus"><img src={img(12)!.src} alt={img(12)!.alt} /></figure>}
      <h2>{P.p12.talkTitle}</h2>
      {!cmp ? (
        <Locked text={P.p11.locked} button={P.p11.lockButton} onGo={() => go(10)} />
      ) : (
        [cmp.aboutMe, cmp.aboutPartner].map((g) => (
          <div key={g.head} className="act">
            <span className="k">{g.head}</span>
            <p>{g.action}</p>
            {g.projectionAction && <p>{g.projectionAction}</p>}
          </div>
        ))
      )}
      {P.p12.plan.length > 0 && (
        <>
          <h2 style={{ marginTop: 6 }}>{P.p12.planTitle}</h2>
          <section className="plan">
            <p className="small" style={{ margin: 0 }}>{P.p12.planNote}</p>
            <ol>
              {P.p12.plan.map((s) => (
                <li key={s.day}><span className={`day${s.both ? " both" : ""}`}>{s.day}<br />{s.day === "3일차" ? "돌아보기" : s.both ? "둘이" : "나"}</span>
                  <div>
                    <p className="t">{s.title}</p>
                    {s.how && <p className="h">{s.how}</p>}
                    {s.ex?.map((e) => <p key={e} className="h">{e}</p>)}
                    {s.role && <p className="role">{s.role}</p>}
                    {s.tired && <p className="tired">지친 날이면 대신: {s.tired}</p>}
                  </div>
                </li>
              ))}
            </ol>
            {P.p12.planWhy && <p className="why" style={{ margin: 0 }}>{P.p12.planWhy}</p>}
            {P.p12.solo && <p className="tired" style={{ margin: 0 }}>{P.p12.solo}</p>}
            <p className="src" style={{ margin: 0 }}>{P.p12.planSrc}</p>
          </section>
        </>
      )}
      {cmp && cmp.extra.length > 0 && (
        <>
          <h2 style={{ marginTop: 6 }}>{P.p12.extraTitle}</h2>
          {cmp.extra.map((f) => (
            <article key={f.code} className="pc together">
              <header><b>{f.cat}</b><span>둘이 함께 · 2일차 대신 또는 1주일에</span></header>
              <div className="body"><p className="ttl">{f.title}</p><p className="row">{f.how}</p><p className="src">연인과 함께 하는 작심삼일 · {f.code}</p></div>
            </article>
          ))}
        </>
      )}
      <h2 style={{ marginTop: 6 }}>{P.p12.sowellaTitle}</h2>
      <div className="chat">
        {P.p12.bubble && <p className="bubble">{P.p12.bubble}</p>}
        {P.p12.bubble && <p className="small" style={{ margin: 0 }}>↑ 2일차에 쏘웰라가 먼저 보내는 말(예시)</p>}
        <div className="starters">{P.p12.starters.map((q) => <button key={q} onClick={() => window.open(SOWELLA_URL, "_blank", "noopener")}>{q}</button>)}</div>
      </div>
      <button className="cta" onClick={() => window.open(SOWELLA_URL, "_blank", "noopener")}>쏘웰라와 이야기 시작하기</button>
      <ShareRow onShare={share} onSave={() => window.print()} onCopy={copyLink} saveLabel="리포트 저장" />
      <p className="disclaimer">{P.p12.disclaimer}</p>
    </>
  );

  const top = (
    <div className="dots" role="tablist">
      {Array.from({ length: PAGES }, (_, i) => (
        <button key={i} aria-label={`${i + 1}쪽`} aria-current={page === i + 1} onClick={() => go(i + 1)}><i /></button>
      ))}
    </div>
  );
  const bottom = (
    <nav className="nav">
      <button className="prev" disabled={page <= 1} onClick={() => go(page - 1)}>이전</button>
      <button className="next" onClick={() => (page === PAGES ? router.push("/") : go(page + 1))}>{nextLabel}</button>
    </nav>
  );
  return (
    <Shell top={top} bottom={bottom}>
      <div
        className="page"
        key={page}
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) >= 60) go(dx < 0 ? page + 1 : page - 1);
        }}
      >
        <p className="pno">{page} / {PAGES}</p>
        {body}
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </Shell>
  );
}

function ReportWait({ r, teaser, onRetry }: { r: ResultPayload["report"]; teaser: string; onRetry: () => void }) {
  if (r.aiOff) return <div className="box"><p>AI 리포트 설정(OPENAI_API_KEY)이 비어 있어 리포트를 만들 수 없습니다.</p></div>;
  if (r.status === "failed") {
    return (
      <div className="box">
        <p>리포트를 만들지 못했습니다. 잠시 뒤 다시 만들어 볼 수 있습니다.</p>
        {r.why && <p className="small">{r.why} (시도 {r.attempts}회)</p>}
        {r.canRetry && <button className="btn-navy" onClick={onRetry}>다시 만들기</button>}
      </div>
    );
  }
  return (
    <div className="box" aria-live="polite">
      <p className="small">{teaser.replace(/\*\*/g, "")}</p>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}><div className="wave-dot" style={{ width: 24, height: 24, borderWidth: 3 }} aria-hidden /><p>바다 친구들이 리포트를 쓰고 있습니다… 1~3분쯤 걸립니다.</p></div>
      {r.why && <p className="small">앞선 시도: {r.why} — 다시 쓰는 중입니다.</p>}
    </div>
  );
}

function ShareRow({ onShare, onSave, onCopy, saveLabel }: { onShare: () => void; onSave: () => void; onCopy: () => void; saveLabel: string }) {
  return (
    <div className="share">
      <button className="kakao" onClick={onShare} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}><KakaoTalkLogo size={20} />카카오톡으로 공유</button>
      <button onClick={onSave}>{saveLabel}</button>
      <button onClick={onCopy}>링크 복사</button>
    </div>
  );
}

function Locked({ text, button, onGo }: { text: string; button: string; onGo: () => void }) {
  return (
    <div className="lockbox"><p>{text}</p><button onClick={onGo}>{button}</button></div>
  );
}

// 상대 유형 고르기: 20유형을 역량별로 묶고, 맨 아래 '히든'(바다의 노인) — partner_compare.options
function TypeSelect({ id, value, onChange, placeholder, cmp }: { id: string; value: string; onChange: (v: string) => void; placeholder: string; cmp: CompareData }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {cmp.comps.map((c) => (
        <optgroup key={c} label={c}>
          {cmp.types.filter((t) => t.comp === c && t.name !== "바다의 노인").map((t) => <option key={t.name} value={t.name}>{t.name} · {t.mode}</option>)}
        </optgroup>
      ))}
      <optgroup label="히든"><option value="바다의 노인">바다의 노인 · 히든</option></optgroup>
    </select>
  );
}
