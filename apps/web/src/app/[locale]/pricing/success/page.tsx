import { useTranslations } from "next-intl";
import { CheckCircle, Mail } from "lucide-react";

export default function CheckoutSuccessPage() {
  const t = useTranslations("pricing.success");

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-teal-600" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-neutral-900">
            {t("title")}
          </h1>
          <p className="text-neutral-600">{t("description")}</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
            <Mail className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-neutral-900">
              {t("checkEmail")}
            </p>
            <p className="text-sm text-neutral-500">
              {t("checkEmailDescription")}
            </p>
          </div>
        </div>

        <p className="text-xs text-neutral-400">{t("spamNote")}</p>
      </div>
    </div>
  );
}
