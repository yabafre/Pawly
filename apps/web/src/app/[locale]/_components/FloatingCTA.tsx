"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

export function FloatingCTA() {
  const t = useTranslations("landing.cta");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const hero = document.querySelector("section:first-of-type");
      const cta = document.querySelector("[data-floating-boundary]");
      if (!hero) return;

      const heroBottom = hero.getBoundingClientRect().bottom;
      const ctaTop = cta?.getBoundingClientRect().top ?? Infinity;
      const windowHeight = window.innerHeight;

      // Show after hero is scrolled past, hide when CTA section is in view
      setVisible(heroBottom < 0 && ctaTop > windowHeight * 0.5);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <Button size="lg" asChild className="gap-2 rounded-full shadow-lg shadow-primary/20 px-6">
        <Link href="/pricing/register?plan=starter">
          {t("floatingButton")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
