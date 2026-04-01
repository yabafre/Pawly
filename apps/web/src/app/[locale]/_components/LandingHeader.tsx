import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { Link } from "@/i18n/navigation";
import { PawlyLogo } from "@/components/pawly-logo";
import { Button } from "@/components/ui/button";

export async function LandingHeader() {
  const t = await getTranslations("landing.header");

  const cookieStore = await cookies();
  const isLoggedIn = !!cookieStore.get("auth-token")?.value;

  return (
    <>
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/40">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
          <Link href="/" aria-label="Pawly Home">
            <PawlyLogo />
          </Link>

          <Button size="sm" asChild>
            <Link href={isLoggedIn ? "/admin/dashboard" : "/login"}>
              {isLoggedIn ? t("account") : t("login")}
            </Link>
          </Button>
        </div>
      </header>
    </>
  );
}
