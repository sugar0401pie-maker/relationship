import { redirect } from "next/navigation";

export default async function ResultIndex({ params }: PageProps<"/result/[id]">) {
  const { id } = await params;
  redirect(`/result/${id}/1`);
}
