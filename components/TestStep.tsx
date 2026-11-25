"use client";

// 장면 한 개 화면. 문구는 서버가 렌더해서 보낸다(lib/rel/steps.ts). 보기를 누르면 저장하고 다음 장면 주소로 넘어간다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "./Shell";
import { api } from "@/lib/client/api";
import type { StepScreen } from "@/lib/rel/steps";

const DONT_KNOW = "잘 모르겠어요";

export default function TestStep({ id, step }: { id: string; step: string }) {
  const router = useRouter();
  const [s, setS] = useState<StepScreen | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ screen?: StepScreen; redirect?: string }>(`/api/rel/session/${id}/step/${step}`)
      .then((r) => {
        if (!alive) return;
        if (r.redirect) router.replace(r.redirect === "done" ? `/test/${id}/done` : `/test/${id}/${r.redirect}`);
        else if (r.screen) { setS(r.screen); setPicked(r.screen.selected); }
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : "불러오지 못했습니다."));
    return () => { alive = false; };
  }, [id, step, router]);

  async function choose(value: string) {
    if (busy) return;
    setPicked(value);
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ next: string }>(`/api/rel/session/${id}/answer`, { method: "POST", body: { step, value } });
      router.push(r.next === "done" ? `/test/${id}/done` : `/test/${id}/${r.next}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장하지 못했습니다.");
      setBusy(false);
    }
  }

  const progress = s?.sceneNo ? Math.round((s.sceneNo / s.total) * 100) : s?.part === 2 ? 66 : s ? 5 : 0;
  const top = s && (
    <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
      <div className="progress" aria-hidden><i style={{ width: `${progress}%` }} /></div>
      <div className="small" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{s.part === 1 ? "1부 · 나" : "2부 · 내 눈에 비친 모습"}</span>
        {s.sceneNo && <span>{s.sceneNo} / {s.total}</span>}
      </div>
    </div>
  );

  return (
    <Shell top={top}>
      {err && <p className="err-box" role="alert">{err}</p>}
      {!s ? (
        !err && <div className="wait"><div className="wave-dot" aria-label="불러오는 중" /></div>
      ) : s.kind === "intro" ? (
        <div className="page">
          {s.heading && <p className="pno">{s.heading}</p>}
          {s.body?.map((b) => <h1 key={b} style={{ fontSize: 20 }}>{b}</h1>)}
          {s.safety && (
            <div className="safety">
              <p>{s.safety.notice}</p>
              <p><b>{s.safety.contacts}</b></p>
            </div>
          )}
          <button type="button" className="btn-navy" disabled={busy} onClick={() => choose("start")}>{s.part === 1 ? "1부 시작하기" : "2부 시작하기"}</button>
        </div>
      ) : (
        <div className="page">
          {s.scene && <div className="scene-box">{s.scene}</div>}
          {s.question && <p className="q">{s.question}</p>}
          {s.body?.map((b) => <p key={b} className="q" style={{ fontSize: 16 }}>{b}</p>)}
          <div className="opts" role="group">
            {s.options.map((o) => (
              <button key={o.key} type="button" className="opt" aria-pressed={picked === o.key} disabled={busy} onClick={() => choose(o.key)}>
                <span>{o.text}</span>
                {o.sub && <span className="sub">{o.sub}</span>}
              </button>
            ))}
            {s.dontKnow && (
              <button type="button" className="opt dk" aria-pressed={picked === "dk"} disabled={busy} onClick={() => choose("dk")}>{DONT_KNOW}</button>
            )}
          </div>
          {s.hint && <p className="hint-line">{s.hint}</p>}
        </div>
      )}
      {s?.prev && (
        <button type="button" className="btn-line" style={{ marginTop: 20 }} disabled={busy} onClick={() => router.push(`/test/${id}/${s.prev}`)}>
          이전 장면
        </button>
      )}
    </Shell>
  );
}
