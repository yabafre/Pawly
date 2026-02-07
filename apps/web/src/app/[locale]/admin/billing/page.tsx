import { setRequestLocale, getTranslations } from "next-intl/server";
import { trpc } from "@/lib/trpc/client";
import { BillingOverview } from "./_components/BillingOverview";
import type { BillingOverview as BillingOverviewType } from "@pawly/validators";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function BillingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("billing");

  let billingData: BillingOverviewType | null = null;
  let error: string | null = null;

  try {
    const overview = await trpc.stripe.getBillingOverview.query();
    billingData = {
      subscription: { ...overview.subscription },
      invoices: overview.invoices.map((inv) => ({ ...inv })),
    };
  } catch (err) {
    console.error("[BillingPage] Failed to load billing data:", err);
    error = t("errors.loadFailed");
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#171717]">{t("title")}</h1>
        <p className="text-[#737373] mt-1">{t("subtitle")}</p>
      </div>

      {error && (
        <div className="rounded-2xl bg-[#F43F5E]/10 px-6 py-4 text-sm text-[#F43F5E] font-medium">
          {error}
        </div>
      )}

      {billingData && (
        <BillingOverview data={billingData} locale={locale} />
      )}
    </div>
  );
}
