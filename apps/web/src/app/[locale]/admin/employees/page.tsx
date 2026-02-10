import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { EmployeeList } from "./_components/EmployeeList";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "employees.meta" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function EmployeesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "employees" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          {t("page.title")}
        </h1>
        <p className="text-neutral-500">{t("page.subtitle")}</p>
      </div>
      <EmployeeList />
    </div>
  );
}
