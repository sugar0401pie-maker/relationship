import AuthGate from "@/components/AuthGate";
import TestStep from "@/components/TestStep";

export const metadata = { title: "장면 · 강에 사는 나, 바다에 사는 너" };

// 장면마다 자기 주소: /test/{세션}/{intro1 | p1-01…p1-20 | c1-comp | m1-1…m1-4 | c1-mode | intro2 | p2-01…p2-10 | c2-comp | m2-1…m2-4 | c2-mode}
export default async function StepPage({ params }: PageProps<"/test/[id]/[step]">) {
  const { id, step } = await params;
  return (
    <AuthGate>
      <TestStep id={id} step={step} />
    </AuthGate>
  );
}
