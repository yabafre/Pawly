"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreditCard,
  ExternalLink,
  Download,
  FileText,
  AlertCircle,
  Clock,
} from "lucide-react";
import { useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { createBillingPortalSessionAction } from "../_actions/billing-actions";
import { toast } from "sonner";
import type { BillingOverview as BillingOverviewType } from "@pawly/validators";

type StatusVariant = "active" | "trialing" | "past_due" | "canceled" | "unpaid";
type InvoiceStatusVariant = "paid" | "open" | "void" | "uncollectible";

const STATUS_STYLES: Record<StatusVariant, string> = {
  active: "bg-[#009588] text-white",
  trialing: "bg-indigo-500 text-white",
  past_due: "bg-[#F97316] text-white",
  canceled: "bg-[#F43F5E] text-white",
  unpaid: "bg-[#F43F5E] text-white",
};

const INVOICE_STATUS_STYLES: Record<InvoiceStatusVariant, string> = {
  paid: "bg-emerald-500 text-white",
  open: "bg-indigo-500 text-white",
  void: "bg-neutral-400 text-white",
  uncollectible: "bg-[#F43F5E] text-white",
};

const getStatusStyle = (status: string): string =>
  STATUS_STYLES[status as StatusVariant] ?? "bg-neutral-400 text-white";

const getInvoiceStatusStyle = (status: string): string =>
  INVOICE_STATUS_STYLES[status as InvoiceStatusVariant] ?? "bg-neutral-400 text-white";

interface BillingOverviewProps {
  data: BillingOverviewType;
  locale: string;
}

export function BillingOverview({ data, locale }: BillingOverviewProps) {
  const t = useTranslations("billing");
  const format = useFormatter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const { mutate: createPortalSession } = useServerActionMutation(
    createBillingPortalSessionAction,
    {
      onSuccess: ({ data: result }) => {
        if (result?.url) {
          setIsRedirecting(true);
          window.location.href = result.url;
        }
      },
      onError: () => {
        toast.error(t("errors.portalFailed"));
        setIsRedirecting(false);
      },
    },
  );

  const handleManageSubscription = () => {
    setIsRedirecting(true);
    const returnUrl = `${window.location.origin}/${locale}/admin/billing`;
    createPortalSession({ returnUrl, locale: locale as "fr" | "en" });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return format.number(amount / 100, {
      style: "currency",
      currency,
    });
  };

  const formatDate = (dateStr: string) => {
    return format.dateTime(new Date(dateStr), { dateStyle: "medium" });
  };

  const { subscription, invoices } = data;

  return (
    <div className="space-y-6">
      {/* Subscription Card */}
      <Card className="rounded-2xl border-0 shadow-[0_4px_20px_-4px_rgba(0,149,136,0.15)] bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#009588]/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-[#009588]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#171717]">
                  {t("labels.currentPlan")}
                </h2>
                <p className="text-sm text-[#737373]">
                  {subscription.planName}
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getStatusStyle(subscription.status)}`}
            >
              {t(`status.${subscription.status}`)}
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {/* Price */}
          {subscription.priceAmount !== null && subscription.priceCurrency && (
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-[#171717]">
                {formatCurrency(subscription.priceAmount, subscription.priceCurrency)}
              </span>
              {subscription.priceInterval && (
                <span className="text-sm text-[#737373]">
                  / {t(`labels.interval.${subscription.priceInterval}`)}
                </span>
              )}
            </div>
          )}

          {/* Renewal date */}
          {subscription.currentPeriodEnd && (
            <div className="flex items-center gap-2 text-sm text-[#737373]">
              <Clock className="w-4 h-4" />
              <span>
                {t("plan.renewalDate", {
                  date: formatDate(subscription.currentPeriodEnd),
                })}
              </span>
            </div>
          )}

          {/* Trial end */}
          {subscription.trialEnd && subscription.status === "trialing" && (
            <div className="flex items-center gap-2 text-sm text-indigo-600">
              <Clock className="w-4 h-4" />
              <span>
                {t("plan.trialEnd", {
                  date: formatDate(subscription.trialEnd),
                })}
              </span>
            </div>
          )}

          {/* Cancel pending banner */}
          {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
            <div className="flex items-center gap-3 rounded-xl bg-[#F97316]/10 px-4 py-3 mt-2">
              <AlertCircle className="w-5 h-5 text-[#F97316] shrink-0" />
              <span className="text-sm font-medium text-[#F97316]">
                {t("plan.cancelPending", {
                  date: formatDate(subscription.currentPeriodEnd),
                })}
              </span>
            </div>
          )}
        </CardContent>

        <CardFooter className="pt-2">
          <Button
            onClick={handleManageSubscription}
            disabled={isRedirecting}
            className="bg-[#009588] hover:bg-[#00796B] text-white rounded-xl px-6"
          >
            {isRedirecting ? (
              t("actions.redirecting")
            ) : (
              <>
                {t("actions.manageSubscription")}
                <ExternalLink className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Invoice History */}
      <Card className="rounded-2xl border-0 shadow-[0_4px_20px_-4px_rgba(0,149,136,0.15)] bg-white">
        <CardHeader>
          <h2 className="text-lg font-bold text-[#171717]">
            {t("invoices.title")}
          </h2>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#737373]">
              <FileText className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">{t("invoices.noInvoices")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-neutral-100">
                  <TableHead className="text-[#737373]">{t("invoices.date")}</TableHead>
                  <TableHead className="text-[#737373]">{t("invoices.amount")}</TableHead>
                  <TableHead className="text-[#737373]">{t("invoices.status")}</TableHead>
                  <TableHead className="text-right text-[#737373]">{t("invoices.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id} className="border-neutral-100">
                    <TableCell className="text-[#171717] text-sm">
                      {formatDate(invoice.created)}
                    </TableCell>
                    <TableCell className="text-[#171717] font-medium text-sm">
                      {formatCurrency(invoice.amountPaid, invoice.currency)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getInvoiceStatusStyle(invoice.status)}`}
                      >
                        {t(`invoices.${invoice.status}`)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {invoice.invoicePdf && (
                          <a
                            href={invoice.invoicePdf}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#009588] hover:text-[#00796B] font-medium transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            {t("invoices.downloadPdf")}
                          </a>
                        )}
                        {invoice.hostedInvoiceUrl && (
                          <a
                            href={invoice.hostedInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#737373] hover:text-[#171717] font-medium transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {t("invoices.viewInvoice")}
                          </a>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
