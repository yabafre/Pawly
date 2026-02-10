"use client";

import { useTranslations } from "next-intl";
import { useForm } from "@tanstack/react-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JOB_TYPES, CONTRACT_TYPES } from "@pawly/validators";
import { createEmployeeSchema, updateEmployeeSchema } from "@pawly/validators";

type EmployeeFormProps = {
  defaultValues?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    jobType?: string;
    contractType?: string;
    contractHours?: number;
    color?: string;
    hireDate?: string;
    endDate?: string;
  };
  onSubmit: (data: Record<string, unknown>) => void;
  isPending: boolean;
  mode: "create" | "edit";
};

export function EmployeeForm({ defaultValues, onSubmit, isPending, mode }: EmployeeFormProps) {
  const t = useTranslations("employees");

  const form = useForm({
    defaultValues: {
      firstName: defaultValues?.firstName ?? "",
      lastName: defaultValues?.lastName ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      jobType: defaultValues?.jobType ?? "VET",
      contractType: defaultValues?.contractType ?? "CDI",
      contractHours: defaultValues?.contractHours ?? 35,
      color: defaultValues?.color ?? "#3b82f6",
      hireDate: defaultValues?.hireDate ?? "",
      endDate: defaultValues?.endDate ?? "",
    },
    onSubmit: async ({ value }) => {
      if (mode === "edit" && defaultValues?.id) {
        const result = updateEmployeeSchema.safeParse({ ...value, id: defaultValues.id });
        if (result.success) {
          onSubmit(result.data);
        }
      } else {
        const result = createEmployeeSchema.safeParse(value);
        if (result.success) {
          onSubmit(result.data);
        }
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <form.Field name="firstName">
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="firstName">{t("form.firstName")}</Label>
              <Input
                id="firstName"
                className="h-12 focus-visible:ring-[#009588]/20"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
                required
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-red-600" role="alert">
                  {t("validation.firstNameRequired")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="lastName">
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="lastName">{t("form.lastName")}</Label>
              <Input
                id="lastName"
                className="h-12 focus-visible:ring-[#009588]/20"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
                required
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-red-600" role="alert">
                  {t("validation.lastNameRequired")}
                </p>
              )}
            </div>
          )}
        </form.Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <form.Field name="email">
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("form.email")}</Label>
              <Input
                id="email"
                type="email"
                className="h-12 focus-visible:ring-[#009588]/20"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-red-600" role="alert">
                  {t("validation.invalidEmail")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="phone">
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="phone">{t("form.phone")}</Label>
              <Input
                id="phone"
                type="tel"
                className="h-12 focus-visible:ring-[#009588]/20"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </div>
          )}
        </form.Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <form.Field name="jobType">
          {(field: any) => (
            <div className="space-y-1.5">
              <Label>{t("form.jobType")}</Label>
              <Select value={field.state.value} onValueChange={field.handleChange}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_TYPES.map((jt) => (
                    <SelectItem key={jt} value={jt}>
                      {t(`jobTypes.${jt}` as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="contractType">
          {(field: any) => (
            <div className="space-y-1.5">
              <Label>{t("form.contractType")}</Label>
              <Select value={field.state.value} onValueChange={field.handleChange}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((ct) => (
                    <SelectItem key={ct} value={ct}>
                      {t(`contractTypes.${ct}` as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <form.Field name="contractHours">
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="contractHours">{t("form.contractHours")}</Label>
              <Input
                id="contractHours"
                type="number"
                min={1}
                max={48}
                className="h-12 focus-visible:ring-[#009588]/20"
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-red-600" role="alert">
                  {t("validation.hoursRange")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="color">
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="color">{t("form.color")}</Label>
              <Input
                id="color"
                type="color"
                className="h-12 w-full cursor-pointer"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>

        <div />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <form.Field name="hireDate">
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="hireDate">{t("form.hireDate")}</Label>
              <Input
                id="hireDate"
                type="date"
                className="h-12 focus-visible:ring-[#009588]/20"
                value={field.state.value ? new Date(field.state.value).toISOString().split("T")[0] : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  field.handleChange(val ? new Date(val).toISOString() : "");
                }}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="endDate">
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="endDate">{t("form.endDate")}</Label>
              <Input
                id="endDate"
                type="date"
                className="h-12 focus-visible:ring-[#009588]/20"
                value={field.state.value ? new Date(field.state.value).toISOString().split("T")[0] : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  field.handleChange(val ? new Date(val).toISOString() : "");
                }}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-red-600" role="alert">
                  {t("validation.endDateAfterHire")}
                </p>
              )}
            </div>
          )}
        </form.Field>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <form.Subscribe selector={(state: any) => [state.canSubmit, state.isSubmitting]}>
          {(state: any) => (
            <Button
              type="submit"
              disabled={!state[0] || isPending}
              className="bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 h-12 px-6"
            >
              {isPending ? "..." : t("actions.save")}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
