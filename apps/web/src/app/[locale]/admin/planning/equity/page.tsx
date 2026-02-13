import { getTranslations, setRequestLocale } from "next-intl/server";
import { Scale } from "lucide-react";
import { EquityCountersClient } from "./_components/EquityCountersClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function EquityPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "admin.equityCounters" });

  return (
    <div className="relative space-y-6 animate-in fade-in duration-700">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-10%] right-[10%] w-[500px] h-[500px] bg-[#009588]/[0.04] blur-[100px] rounded-full mix-blend-multiply" />
        <div className="absolute bottom-[-10%] left-[5%] w-[400px] h-[400px] bg-orange-500/[0.03] blur-[100px] rounded-full mix-blend-multiply" />
      </div>

      <section className="relative z-10 overflow-hidden rounded-3xl border border-neutral-100 bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)] md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-[250px] w-[250px] rounded-full bg-[#009588] opacity-[0.06] blur-[80px]" />

        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#009588]/20 bg-[#009588]/10 px-3 py-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[#009588]/20">
                <Scale className="h-3 w-3 text-[#009588]" strokeWidth={1.5} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#00796B]">
                {t("title")}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[#171717]">
              {t("title")}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-neutral-500">
              {t("subtitle")}
            </p>
          </div>
        </div>
      </section>

      <div className="relative z-10">
        <EquityCountersClient />
      </div>
    </div>
  );
}
