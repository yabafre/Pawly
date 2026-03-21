import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PawlyLogo } from "@/components/pawly-logo";
import { Button } from "@/components/ui/button";

export async function LandingHeader() {
  const t = await getTranslations("landing.header");

  return (
    <>
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/40">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
          <Link href="/" aria-label="Pawly Home">
            <PawlyLogo />
          </Link>

          <Button size="sm" asChild>
            <Link href="/login">{t("login")}</Link>
          </Button>
        </div>
      </header>
    </>
  );
}
