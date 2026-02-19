import { setRequestLocale } from "next-intl/server";
import { GenerationPanel } from "./_components/GenerationPanel";

type Props = { params: Promise<{ locale: string }> };

export default async function PlanningPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="h-full flex flex-col animate-in fade-in space-y-6">
      <GenerationPanel />
    </div>
  );
}
