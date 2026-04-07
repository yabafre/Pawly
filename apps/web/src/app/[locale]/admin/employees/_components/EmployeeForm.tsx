"use client";

import { useTranslations } from "next-intl";
import { useForm } from "@tanstack/react-form";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { JOB_TYPES, CONTRACT_TYPES, employeeFieldsSchema } from "@pawly/validators";

const EMPLOYEE_COLORS = [
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#ec4899", "#f43f5e", "#ef4444", "#f97316",
  "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#14b8a6", "#06b6d4", "#0ea5e9", "#6b7280",
];

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

  const toISOString = (val: unknown): string => {
    if (!val) return "";
    if (val instanceof Date) return val.toISOString();
    return String(val);
  };

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
      hireDate: toISOString(defaultValues?.hireDate),
      endDate: toISOString(defaultValues?.endDate),
    },
    onSubmit: async ({ value }) => {
      if (mode === "edit" && defaultValues?.id) {
        onSubmit({ ...value, id: defaultValues.id });
        return;
      }
      onSubmit(value);
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
        <form.Field
          name="firstName"
          validators={{
            onChange: ({ value }) => {
              const result = employeeFieldsSchema.shape.firstName.safeParse(value);
              return result.success ? undefined : t("validation.firstNameRequired");
            },
          }}
        >
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="firstName">{t("form.firstName")}</Label>
              <Input
                id="firstName"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
                required
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive" role="alert">
                  {t("validation.firstNameRequired")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field
          name="lastName"
          validators={{
            onChange: ({ value }) => {
              const result = employeeFieldsSchema.shape.lastName.safeParse(value);
              return result.success ? undefined : t("validation.lastNameRequired");
            },
          }}
        >
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="lastName">{t("form.lastName")}</Label>
              <Input
                id="lastName"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
                required
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive" role="alert">
                  {t("validation.lastNameRequired")}
                </p>
              )}
            </div>
          )}
        </form.Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <form.Field
          name="email"
          validators={{
            onChange: ({ value }) => {
              if (!value || !value.trim()) return t("validation.emailRequired");
              const result = employeeFieldsSchema.shape.email.safeParse(value);
              return result.success ? undefined : t("validation.invalidEmail");
            },
          }}
        >
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("form.email")} *</Label>
              <Input
                id="email"
                type="email"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
                required
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive" role="alert">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field
          name="phone"
          validators={{
            onChange: ({ value }) => {
              if (!value || !value.trim()) return t("validation.phoneRequired");
              return undefined;
            },
          }}
        >
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="phone">{t("form.phone")} *</Label>
              <Input
                id="phone"
                type="tel"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
                required
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive" role="alert">
                  {field.state.meta.errors[0]}
                </p>
              )}
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
                <SelectTrigger className="h-11">
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
                <SelectTrigger className="h-11">
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

      <div className="grid grid-cols-2 gap-4">
        <form.Field
          name="contractHours"
          validators={{
            onChange: ({ value }) => {
              const result = employeeFieldsSchema.shape.contractHours.safeParse(value);
              return result.success ? undefined : t("validation.hoursRange");
            },
          }}
        >
          {(field: any) => (
            <div className="space-y-1.5">
              <Label htmlFor="contractHours">{t("form.contractHours")}</Label>
              <Input
                id="contractHours"
                type="number"
                min={1}
                max={48}
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive" role="alert">
                  {t("validation.hoursRange")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="color">
          {(field: any) => (
            <div className="space-y-1.5 col-span-2">
              <div className="flex items-center gap-2">
                <Label>{t("form.color")}</Label>
                <span
                  className="inline-block w-4 h-4 rounded-full border border-border"
                  style={{ backgroundColor: field.state.value }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {EMPLOYEE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => field.handleChange(color)}
                    className={cn(
                      "w-8 h-8 rounded-full cursor-pointer transition-all flex items-center justify-center",
                      field.state.value === color
                        ? "ring-2 ring-offset-2 ring-ring scale-110"
                        : "hover:scale-110"
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={color}
                  >
                    {field.state.value === color && (
                      <Check className="w-4 h-4 text-white drop-shadow-sm" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form.Field>
      </div>

      <form.Subscribe selector={(state: any) => state.values.contractType}>
        {(contractType: any) => (
          <div className={contractType === "CDI" ? "" : "grid grid-cols-2 gap-4"}>
            <form.Field name="hireDate">
              {(field: any) => (
                <div className="space-y-1.5">
                  <Label>{t("form.hireDate")}</Label>
                  <DatePicker
                    value={field.state.value ? new Date(field.state.value) : null}
                    onChange={(date) => field.handleChange(date ? date.toISOString() : "")}
                    placeholder={t("form.hireDate")}
                  />
                </div>
              )}
            </form.Field>

            {contractType !== "CDI" && (
              <form.Field
                name="endDate"
                validators={{
                  onChangeListenTo: ["hireDate", "contractType"],
                  onChange: ({ value, fieldApi }) => {
                    const contractType = fieldApi.form.getFieldValue("contractType");
                    const hireDate = fieldApi.form.getFieldValue("hireDate");
                    const endDate = typeof value === "string" ? value : "";
                    const normalizedHireDate = typeof hireDate === "string" ? hireDate : "";

                    if (contractType === "CDI" || endDate === "" || normalizedHireDate === "") {
                      return undefined;
                    }

                    return new Date(endDate) > new Date(normalizedHireDate)
                      ? undefined
                      : t("validation.endDateAfterHire");
                  },
                }}
              >
                {(field: any) => (
                  <div className="space-y-1.5">
                    <Label>{t("form.endDate")}</Label>
                    <DatePicker
                      value={field.state.value ? new Date(field.state.value) : null}
                      onChange={(date) => field.handleChange(date ? date.toISOString() : "")}
                      placeholder={t("form.endDate")}
                    />
                    {field.state.meta.errors.length > 0 && (
                      <p className="text-sm text-destructive" role="alert">
                        {t("validation.endDateAfterHire")}
                      </p>
                    )}
                  </div>
                )}
              </form.Field>
            )}
          </div>
        )}
      </form.Subscribe>

      <div className="flex justify-end gap-3 pt-4">
        <Button
          type="submit"
          disabled={isPending}
          size="lg"
          className="rounded-2xl"
        >
          {isPending ? "..." : t("actions.save")}
        </Button>
      </div>
    </form>
  );
}
