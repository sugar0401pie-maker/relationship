import AuthGate from "@/components/AuthGate";
import StartForm from "@/components/StartForm";

export const metadata = { title: "시작하기 · 강에 사는 나, 바다에 사는 너" };

export default function StartPage() {
  return (
    <AuthGate>
      <StartForm />
    </AuthGate>
  );
}
