// 두 사람 레이더(나 = 남색 실선, {애칭} = 하늘색 점선, 1~4점). 결제후_리포트화면_v1.md 2쪽.
// {애칭} 쪽에서 '잘 모르겠어요'만 고른 역량은 점을 찍지 않고 1점 자리(가운데 쪽)에 둔 뒤 이름 옆에 '?'를 붙인다.
export default function Radar({ comps, me, partner, nickname }: { comps: string[]; me: number[]; partner: (number | null)[]; nickname: string }) {
  const cx = 160, cy = 150, R = 105, n = comps.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const r = (Math.max(1, Math.min(4, v)) / 4) * R;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(",")).join(" ");
  return (
    <div className="radar">
      <h2>다섯 가지 힘, 두 사람 겹쳐 보기</h2>
      <svg viewBox="0 0 320 300" role="img" aria-label={`나와 ${nickname}의 역량 점수`}>
        {[1, 2, 3, 4].map((g) => <polygon key={g} points={poly(comps.map(() => g))} fill="none" stroke="#D8E1EA" />)}
        {comps.map((c, i) => {
          const [x, y] = pt(i, 4.9);
          return <text key={c} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#1C2B3A">{c}{partner[i] == null ? " ?" : ""}</text>;
        })}
        <polygon points={poly(partner.map((v) => v ?? 1))} fill="#C9D9E855" stroke="#7FA3C4" strokeWidth="2" strokeDasharray="5 4" />
        <polygon points={poly(me)} fill="#01356622" stroke="#013566" strokeWidth="2" />
      </svg>
      <p className="legend"><span><i style={{ background: "#01356633", border: "2px solid #013566" }} />나</span><span><i style={{ background: "#7FA3C433", border: "2px dashed #7FA3C4" }} />내 눈에 비친 {nickname}</span></p>
      <p className="small" style={{ textAlign: "center" }}>점수는 1~4점입니다. 가운데에 가까울수록 요즘 더 에너지가 드는 영역입니다.</p>
    </div>
  );
}
