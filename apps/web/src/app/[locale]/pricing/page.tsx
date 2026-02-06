import { useTranslations } from "next-intl";
import { PreCheckoutForm } from "./_components/PreCheckoutForm";

export default function PricingPage() {
  const t = useTranslations("pricing");
  const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;

  if (!priceId) {
    return (
      <div className="min-h-screen bg-neutral-50 py-16 px-4">
        <div className="max-w-lg mx-auto text-center py-20">
          <p className="text-red-600 font-medium">
            Configuration error: Missing Stripe Price ID
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-16 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center space-y-3 mb-10">
          <h1 className="text-3xl font-bold text-neutral-900">{t("title")}</h1>
          <p className="text-neutral-600">{t("subtitle")}</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-8 shadow-sm">
          <PreCheckoutForm priceId={priceId} />
        </div>
      </div>
    </div>
  );
}
