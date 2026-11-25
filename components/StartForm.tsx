"use client";

// 온보딩: 이름 · 관계(연애/결혼·동거) · {애칭}(마스터 스펙 2장). 관계에 따라 일부 장면 문구가 바뀐다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "./Shell";
import { api } from "@/lib/client/api";
import { getRealSession } from "@/lib/supabase/browser";

/** 한국어 입력(조합) 중 Enter가 제출로 넘어가지 않게 */
function blockImeEnter(e: React.KeyboardEvent<HTMLFormElement>) {
  if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
}
const ok = (s: string) => { const t = s.trim(); return t.length > 0 && [...t].length <= 10 && !/[<>{}|]/.test(t); };

export default function StartForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [rel, setRel] = useState<"연애" | "결혼·동거" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void getRealSession().then((s) => {
      const m = (s?.user.user_metadata ?? {}) as Record<string, unknown>;
      const guess = [m.nickname, m.display_name, m.name].find((x) => typeof x === "string" && ok(x as string));
      if (guess) setName((n) => n || String(guess));
    });
  }, []);

  const ready = ok(name) && ok(nickname) && rel !== null && !busy;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ id: string; next: string }>("/api/rel/session", { method: "POST", body: { name: name.trim(), nickname: nickname.trim(), relationship: rel } });
      router.push(`/test/${r.id}/${r.next}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return (
    <Shell>
      <form className="page" onSubmit={submit} onKeyDown={blockImeEnter}>
        <h1>먼저 두 사람을 알려 주세요</h1>
        <div className="field">
          <label htmlFor="name">내 이름(부를 이름)</label>
          <input id="name" value={name} maxLength={10} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
          <span className="hint">결과 화면에서 &quot;{name.trim() || "○○"}님&quot;으로 불러 드립니다. 10자까지.</span>
        </div>
        <div className="field">
          <label>지금 우리는</label>
          <div className="seg">
            {(["연애", "결혼·동거"] as const).map((r) => (
              <button key={r} type="button" aria-pressed={rel === r} onClick={() => setRel(r)}>{r === "연애" ? "연애 중" : "결혼·동거"}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="nick">연인을 부르는 애칭</label>
          <input id="nick" value={nickname} maxLength={10} onChange={(e) => setNickname(e.target.value)} />
          <span className="hint">장면 속에서 이 애칭으로 묻습니다. 예: 민수, 자기, 여보. 10자까지.</span>
        </div>
        {err && <p className="err-box">{err}</p>}
        <button type="submit" className="btn-navy" disabled={!ready}>{busy ? "준비하고 있습니다…" : "시작하기"}</button>
      </form>
    </Shell>
  );
}
