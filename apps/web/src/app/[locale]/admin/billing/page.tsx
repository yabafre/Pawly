import { setRequestLocale, getTranslations } from "next-intl/server";
import { BillingOverview } from "./_components/BillingOverview";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function BillingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("billing");

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#171717]">{t("title")}</h1>
        <p className="text-[#737373] mt-1">{t("subtitle")}</p>
      </div>

      <BillingOverview locale={locale} />
    </div>
  );
}
