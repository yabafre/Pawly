import { getTranslations } from "next-intl/server";
import { Quote } from "lucide-react";

const testimonialKeys = ["1", "2", "3"] as const;

export async function TestimonialsSection() {
  const t = await getTranslations("landing.testimonials");

  return (
    <section className="py-24 bg-neutral-50">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section heading with badge */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-3 py-1 mb-4 text-xs font-bold tracking-widest text-primary uppercase bg-secondary rounded-full">
            {t("badge")}
          </span>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-4 leading-tight">
            {t("title")}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonialKeys.map((key) => (
            <div
              key={key}
              className="bg-white p-8 rounded-3xl border border-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <Quote className="h-8 w-8 text-primary/20 mb-4" />
              <blockquote className="text-foreground leading-relaxed mb-6">
                &ldquo;{t(`items.${key}.quote`)}&rdquo;
              </blockquote>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {t(`items.${key}.author`)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(`items.${key}.role`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
