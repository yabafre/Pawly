"use client";

import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2 } from "lucide-react";
import { createCheckoutSessionSchema } from "@pawly/validators";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { createCheckoutSessionAction } from "../_actions/checkout-actions";
import { useState } from "react";

interface PreCheckoutFormProps {
  priceId: string;
}

export const PreCheckoutForm = ({ priceId }: PreCheckoutFormProps) => {
  const t = useTranslations("pricing.preCheckout");
  const tErrors = useTranslations("forms.validation");
  const locale = useLocale() as "fr" | "en";
  const [isRedirecting, setIsRedirecting] = useState(false);

  const form = useForm({
    defaultValues: {
      clinicName: "",
      adminName: "",
      adminEmail: "",
    },
    onSubmit: async ({ value }) => {
      try {
        const [result, error] = await createCheckoutSessionAction({
          ...value,
          priceId,
          locale,
        });

        if (error) {
          toast.error(t("error"));
          return;
        }

        setIsRedirecting(true);
        window.location.href = result.url;
      } catch {
        toast.error(t("error"));
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="space-y-5"
    >
      <form.Field
        name="clinicName"
        validators={{
          onChange: ({ value }) => {
            const result =
              createCheckoutSessionSchema.shape.clinicName.safeParse(value);
            return result.success
              ? undefined
              : tErrors("required");
          },
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label
              htmlFor={field.name}
              className="text-neutral-900 font-medium"
            >
              {t("clinicNameLabel")}
            </Label>
            <Input
              id={field.name}
              type="text"
              placeholder={t("clinicNamePlaceholder")}
              required
              aria-invalid={field.state.meta.errors.length > 0}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              className="bg-neutral-50 border-neutral-200 focus:bg-white h-12 transition-all focus-visible:border-teal-500 focus-visible:ring-teal-500/20"
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-[11px] text-orange-600" role="alert">
                {field.state.meta.errors[0]}
              </p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field
        name="adminName"
        validators={{
          onChange: ({ value }) => {
            const result =
              createCheckoutSessionSchema.shape.adminName.safeParse(value);
            return result.success
              ? undefined
              : tErrors("required");
          },
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label
              htmlFor={field.name}
              className="text-neutral-900 font-medium"
            >
              {t("adminNameLabel")}
            </Label>
            <Input
              id={field.name}
              type="text"
              placeholder={t("adminNamePlaceholder")}
              required
              aria-invalid={field.state.meta.errors.length > 0}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              className="bg-neutral-50 border-neutral-200 focus:bg-white h-12 transition-all focus-visible:border-teal-500 focus-visible:ring-teal-500/20"
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-[11px] text-orange-600" role="alert">
                {field.state.meta.errors[0]}
              </p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field
        name="adminEmail"
        validators={{
          onChange: ({ value }) => {
            const result =
              createCheckoutSessionSchema.shape.adminEmail.safeParse(value);
            return result.success
              ? undefined
              : tErrors("email");
          },
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label
              htmlFor={field.name}
              className="text-neutral-900 font-medium"
            >
              {t("adminEmailLabel")}
            </Label>
            <Input
              id={field.name}
              type="email"
              placeholder={t("adminEmailPlaceholder")}
              required
              aria-invalid={field.state.meta.errors.length > 0}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              className="bg-neutral-50 border-neutral-200 focus:bg-white h-12 transition-all focus-visible:border-teal-500 focus-visible:ring-teal-500/20"
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-[11px] text-orange-600" role="alert">
                {field.state.meta.errors[0]}
              </p>
            )}
          </div>
        )}
      </form.Field>

      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
      >
        {([canSubmit, isSubmitting]) => (
          <Button
            type="submit"
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold h-12 shadow-lg shadow-teal-600/10 transition-all hover:scale-[1.01]"
            disabled={!canSubmit || isSubmitting || isRedirecting}
          >
            {isSubmitting || isRedirecting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("submitting")}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                {t("submitButton")}{" "}
                <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
};
