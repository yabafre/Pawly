import { getTranslations } from "next-intl/server";
import { Quote } from "lucide-react";

const testimonialKeys = ["1", "2", "3"] as const;

export async function TestimonialsSection() {
  const t = await getTranslations("landing.testimonials");

  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
            {t("badge")}
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">
            {t("title")}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {testimonialKeys.map((key) => (
            <div
              key={key}
              className="flex flex-col rounded-2xl border bg-card p-6 hover:shadow-md transition-shadow"
            >
              <Quote className="w-5 h-5 text-primary mb-4" />

              <blockquote className="text-sm leading-relaxed flex-1 mb-5">
                &ldquo;{t(`items.${key}.quote`)}&rdquo;
              </blockquote>

              <div className="pt-4 border-t">
                <p className="text-sm font-semibold">
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
