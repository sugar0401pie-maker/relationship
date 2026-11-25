"use client";

// 내 테스트 목록: 끝난 것은 결과로, 하다 만 것은 이어서 하기로.
import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "./Shell";
import { api } from "@/lib/client/api";

type Item = { id: string; display_name: string; nickname: string; status: string; my_type: string | null; partner_type: string | null; created_at: string };

export default function ResultsList() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ items: Item[] }>("/api/rel/session").then((r) => setItems(r.items)).catch((e) => setErr(e instanceof Error ? e.message : "불러오지 못했습니다."));
  }, []);
  const date = (s: string) => new Date(s).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  return (
    <Shell>
      <div className="page">
        <h1>내 결과</h1>
        {err && <p className="err-box">{err}</p>}
        {items && items.length === 0 && <p>아직 한 테스트가 없습니다.</p>}
        <div className="list" style={{ display: "grid", gap: 10 }}>
          {items?.map((it) =>
            it.status === "completed" ? (
              <Link key={it.id} href={`/result/${it.id}/1`}><b>{it.my_type} × 내 눈에 비친 {it.nickname}({it.partner_type})</b><span>{date(it.created_at)}</span></Link>
            ) : (
              <Link key={it.id} href={`/test/${it.id}/intro1`}><b>{it.nickname}과의 테스트 이어서 하기</b><span>{date(it.created_at)} · 하는 중</span></Link>
            ),
          )}
        </div>
        <Link href="/start" className="btn-navy" style={{ textDecoration: "none" }}>새로 테스트하기</Link>
      </div>
    </Shell>
  );
}
