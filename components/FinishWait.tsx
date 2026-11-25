"use client";

// 마지막 장면 뒤: 채점(서버) → 결과 기다림 화면 최소 3초, 3초마다 문장 바뀜, 30초 넘으면 long_wait(데이터 result_flow.loading_rule).
// 문장은 데이터 loading_messages — 이름·애칭은 아직 화면에 없으므로 서버 결과가 오면 채운다. 그 전엔 첫 문장 틀만.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "./Shell";
import { api } from "@/lib/client/api";

export default function FinishWait({ id }: { id: string }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<string[]>([]);
  const [longWait, setLongWait] = useState<string>("");
  const [i, setI] = useState(0);
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t0 = Date.now();
    let alive = true;
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setSec(s);
      setI(Math.floor(s / 3));
    }, 500);
    api<{ id: string; loading: string[]; longWait: string }>(`/api/rel/session/${id}/finish`, { method: "POST" })
      .then((r) => {
        if (!alive) return;
        setMsgs(r.loading);
        setLongWait(r.longWait);
        const wait = Math.max(0, 3000 - (Date.now() - t0));
        setTimeout(() => alive && router.replace(`/result/${id}/1`), wait);
      })
      .catch((e) => {
        if (!alive) return;
        if ((e as { status?: number }).status === 409) router.replace(`/test/${id}/intro1`);
        else setErr(e instanceof Error ? e.message : "결과를 만들지 못했습니다.");
      });
    return () => { alive = false; clearInterval(tick); };
  }, [id, router]);

  const line = sec >= 30 && longWait ? longWait : msgs.length ? msgs[i % msgs.length] : "";
  return (
    <Shell>
      {err ? (
        <div className="page"><p className="err-box">{err}</p><button className="btn-navy" onClick={() => location.reload()}>다시 시도</button></div>
      ) : (
        <div className="wait" aria-live="polite">
          <div className="wave-dot" aria-hidden />
          <p style={{ color: "var(--navy)", fontWeight: 700, minHeight: 28 }}>{line}</p>
          <p className="small">{sec}초</p>
        </div>
      )}
    </Shell>
  );
}
