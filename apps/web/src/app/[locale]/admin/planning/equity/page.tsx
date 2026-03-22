import { getTranslations, setRequestLocale } from "next-intl/server";
import { Scale } from "lucide-react";
import { EquityCountersClient } from "./_components/EquityCountersClient";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.equityCounters" });
  return {
    title: t("title"),
  };
}

export default async function EquityPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "admin.equityCounters" });

  return (
    <div className="relative space-y-6 animate-in fade-in duration-700">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-10%] right-[10%] w-[500px] h-[500px] bg-primary/[0.04] blur-[100px] rounded-full mix-blend-multiply" />
        <div className="absolute bottom-[-10%] left-[5%] w-[400px] h-[400px] bg-orange-500/[0.03] blur-[100px] rounded-full mix-blend-multiply" />
      </div>

      <section className="relative z-10 overflow-hidden rounded-2xl border border-border bg-card p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-[250px] w-[250px] rounded-full bg-primary opacity-[0.06] blur-[80px]" />

        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-secondary px-3 py-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-secondary">
                <Scale className="h-3 w-3 text-primary" strokeWidth={1.5} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                {t("title")}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {t("title")}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
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
