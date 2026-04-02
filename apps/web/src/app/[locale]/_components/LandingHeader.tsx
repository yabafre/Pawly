import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { Link } from "@/i18n/navigation";
import { PawlyLogo } from "@/components/pawly-logo";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";

export async function LandingHeader() {
  const t = await getTranslations("landing.header");

  let accountHref: string | null = null;
  const cookieStore = await cookies();
  const authToken = cookieStore.get("auth-token")?.value;
  if (authToken) {
    try {
      const me = await trpc.auth.getMe.query();
      accountHref = me.role === "ADMIN" ? "/admin/dashboard" : "/dashboard";
    } catch {
      // Invalid token — show login
    }
  }

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/40">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
        <Link href="/" aria-label="Pawly Home">
          <PawlyLogo />
        </Link>

        <nav className="flex items-center gap-6" aria-label="Main navigation">
          <a href="#features" className="hidden sm:inline text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            {t("navFeatures")}
          </a>
          <a href="#pricing" className="hidden sm:inline text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            {t("navPricing")}
          </a>
          <Button size="sm" asChild>
            <Link href={accountHref ?? "/login"}>
              {accountHref ? t("account") : t("login")}
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
