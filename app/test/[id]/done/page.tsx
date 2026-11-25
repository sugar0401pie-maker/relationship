import AuthGate from "@/components/AuthGate";
import FinishWait from "@/components/FinishWait";

export const metadata = { title: "결과 준비 · 강에 사는 나, 바다에 사는 너" };

export default async function DonePage({ params }: PageProps<"/test/[id]/done">) {
  const { id } = await params;
  return (
    <AuthGate>
      <FinishWait id={id} />
    </AuthGate>
  );
}
