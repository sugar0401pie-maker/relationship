import AuthGate from "@/components/AuthGate";
import ResultsList from "@/components/ResultsList";

export const metadata = { title: "내 결과 · 강에 사는 나, 바다에 사는 너" };

export default function ResultsPage() {
  return (
    <AuthGate>
      <ResultsList />
    </AuthGate>
  );
}
