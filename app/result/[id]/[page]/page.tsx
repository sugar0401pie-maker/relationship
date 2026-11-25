import { redirect } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import ResultPages from "@/components/ResultPages";

export const metadata = { title: "결과 · 강에 사는 나, 바다에 사는 너" };

export default async function ResultPage({ params }: PageProps<"/result/[id]/[page]">) {
  const { id, page } = await params;
  const n = Number(page);
  if (!Number.isInteger(n) || n < 1 || n > 10) redirect(`/result/${id}/1`);
  return (
    <AuthGate>
      <ResultPages id={id} page={n} />
    </AuthGate>
  );
}
