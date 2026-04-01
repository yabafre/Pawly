"use client";

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
  Loader2,
  Gift,
  Percent,
  Tag,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { useBilling } from "../_hooks/useBilling";
import { BillingOverviewSkeleton } from "./BillingOverviewSkeleton";

type StatusVariant = "active" | "trialing" | "past_due" | "canceled" | "unpaid";
type InvoiceStatusVariant = "paid" | "open" | "void" | "uncollectible";

const STATUS_STYLES: Record<StatusVariant, string> = {
  active: "bg-primary text-white",
  trialing: "bg-primary/80 text-white",
  past_due: "bg-amber-600 text-white",
  canceled: "bg-destructive text-white",
  unpaid: "bg-destructive text-white",
};

const INVOICE_STATUS_STYLES: Record<InvoiceStatusVariant, string> = {
  paid: "bg-emerald-600 text-white",
  open: "bg-primary/80 text-white",
  void: "bg-muted-foreground text-white",
  uncollectible: "bg-destructive text-white",
};

const getStatusStyle = (status: string): string =>
  STATUS_STYLES[status as StatusVariant] ?? "bg-muted-foreground text-white";

const getInvoiceStatusStyle = (status: string): string =>
  INVOICE_STATUS_STYLES[status as InvoiceStatusVariant] ?? "bg-muted-foreground text-white";

type CouponMetadataType = "partner" | "internal" | "lifetime";

const COUPON_TYPE_STYLES: Record<CouponMetadataType, string> = {
  partner: "bg-emerald-600 text-white",
  internal: "bg-primary/80 text-white",
  lifetime: "bg-primary text-white",
};

const getCouponTypeStyle = (type: string | null | undefined): string =>
  COUPON_TYPE_STYLES[type as CouponMetadataType] ?? "bg-muted-foreground text-white";

interface BillingOverviewProps {
  locale: string;
}

export function BillingOverview({ locale }: BillingOverviewProps) {
  const t = useTranslations("billing");
  const format = useFormatter();

  const {
    subscription,
    invoices,
    isLoading,
    errorMessage,
    openBillingPortal,
    isPortalPending,
  } = useBilling(locale);

  const formatCurrency = (amount: number, currency: string) => {
    return format.number(amount / 100, {
      style: "currency",
      currency,
    });
  };

  const formatDate = (dateStr: string) => {
    return format.dateTime(new Date(dateStr), { dateStyle: "medium" });
  };

  if (isLoading) {
    return <BillingOverviewSkeleton />;
  }

  if (errorMessage || !subscription) {
    return (
      <div className="rounded-2xl bg-destructive/10 px-6 py-4 text-sm text-destructive font-medium">
        {errorMessage ?? t("errors.loadFailed")}
      </div>
    );
  }

  const isInactive = subscription.status === "past_due" ||
    subscription.status === "canceled" ||
    subscription.status === "unpaid";

  return (
    <div className="space-y-6">
      {/* Inactive Subscription Banner */}
      {isInactive && subscription.status === "past_due" && (
        <div className="rounded-2xl bg-amber-600/10 border border-amber-600/20 p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-600/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground">
                {t("guard.pastDue.title")}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("guard.pastDue.description")}
              </p>
              <Button
                onClick={openBillingPortal}
                disabled={isPortalPending}
                className="mt-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl px-6"
              >
                {isPortalPending ? t("actions.redirecting") : t("guard.pastDue.action")}
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      )}
      {isInactive && subscription.status === "canceled" && (
        <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-destructive" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground">
                {t("guard.canceled.title")}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("guard.canceled.description")}
              </p>
              <Button
                onClick={openBillingPortal}
                disabled={isPortalPending}
                className="mt-4 bg-destructive hover:bg-destructive/90 text-white rounded-xl px-6"
              >
                {isPortalPending ? t("actions.redirecting") : t("guard.canceled.action")}
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      )}
      {isInactive && subscription.status === "unpaid" && (
        <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-destructive" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground">
                {t("guard.unpaid.title")}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("guard.unpaid.description")}
              </p>
              <Button
                onClick={openBillingPortal}
                disabled={isPortalPending}
                className="mt-4 bg-destructive hover:bg-destructive/90 text-white rounded-xl px-6"
              >
                {isPortalPending ? t("actions.redirecting") : t("guard.unpaid.action")}
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Card */}
      <Card className="rounded-2xl border border-border bg-card shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {t("labels.currentPlan")}
                </h2>
                <p className="text-sm text-muted-foreground">
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
              <span className="text-2xl font-bold text-foreground">
                {formatCurrency(subscription.priceAmount, subscription.priceCurrency)}
              </span>
              {subscription.priceInterval && (
                <span className="text-sm text-muted-foreground">
                  / {t(`labels.interval.${subscription.priceInterval}`)}
                </span>
              )}
            </div>
          )}

          {/* Promotion Applied */}
          {subscription.promotionCodeId && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mt-2">
              <div className="flex items-center gap-3">
                {subscription.discountType === "percent" && subscription.discountValue === 100 ? (
                  <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Gift className="w-5 h-5 text-primary" aria-hidden="true" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Percent className="w-5 h-5 text-primary" aria-hidden="true" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">
                      {t("promotion.title")}
                    </span>
                    {subscription.couponMetadataType && (
                      <span
                        className={`inline-flex items-center ${getCouponTypeStyle(subscription.couponMetadataType)} px-2 py-0.5 rounded-full text-xs font-medium`}
                      >
                        {t(`promotion.type.${subscription.couponMetadataType}`)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {subscription.discountType === "percent" && subscription.discountValue === 100 ? (
                      <span className="text-lg font-bold text-primary">
                        {t("promotion.fullDiscount")}
                      </span>
                    ) : subscription.discountType === "percent" && subscription.discountValue !== null && subscription.discountValue !== undefined ? (
                      <span className="text-lg font-bold text-primary">
                        {t("promotion.discountPercent", { value: subscription.discountValue })}
                      </span>
                    ) : subscription.discountType === "amount" && subscription.discountValue !== null && subscription.discountValue !== undefined && subscription.priceCurrency ? (
                      <span className="text-lg font-bold text-primary">
                        {t("promotion.discountAmount", {
                          value: formatCurrency(subscription.discountValue, subscription.priceCurrency),
                        })}
                      </span>
                    ) : null}
                    {subscription.promotionCodeName && (
                      <span className="inline-flex items-center gap-1 bg-primary text-white px-3 py-1 rounded-full text-xs font-bold">
                        <Tag className="w-3 h-3" aria-hidden="true" />
                        {subscription.promotionCodeName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Renewal date */}
          {subscription.currentPeriodEnd && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
            <div className="flex items-center gap-2 text-sm text-primary">
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
            <div className="flex items-center gap-3 rounded-xl bg-amber-600/10 px-4 py-3 mt-2">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <span className="text-sm font-medium text-amber-600">
                {t("plan.cancelPending", {
                  date: formatDate(subscription.currentPeriodEnd),
                })}
              </span>
            </div>
          )}
        </CardContent>

        <CardFooter className="pt-2">
          <Button
            onClick={openBillingPortal}
            disabled={isPortalPending}
            className="bg-primary hover:bg-primary/90 text-white rounded-xl px-6"
          >
            {isPortalPending ? (
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
      <Card className="rounded-2xl border border-border bg-card shadow-sm">
        <CardHeader>
          <h2 className="text-lg font-bold text-foreground">
            {t("invoices.title")}
          </h2>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">{t("invoices.noInvoices")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">{t("invoices.date")}</TableHead>
                  <TableHead className="text-muted-foreground">{t("invoices.amount")}</TableHead>
                  <TableHead className="text-muted-foreground">{t("invoices.status")}</TableHead>
                  <TableHead className="text-right text-muted-foreground">{t("invoices.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id} className="border-border">
                    <TableCell className="text-foreground text-sm">
                      {formatDate(invoice.created)}
                    </TableCell>
                    <TableCell className="text-foreground font-medium text-sm">
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
                            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
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
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
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
