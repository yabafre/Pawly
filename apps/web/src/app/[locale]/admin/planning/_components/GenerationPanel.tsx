"use client";

import { useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGeneration } from "../_hooks/useGeneration";
import { useTemplates } from "../templates/_hooks/useTemplates";
import { GenerationResultView } from "./GenerationResultView";
import { MonthShiftsSummary } from "./MonthShiftsSummary";
import { ConfirmRegenerateDialog } from "./ConfirmRegenerateDialog";
import type { GenerationResult } from "@pawly/validators";

function getMonthOptions(locale: string) {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
    options.push({ value, label });
  }
  return options;
}

export function GenerationPanel() {
  const t = useTranslations("admin.planningGeneration");
  const locale = useLocale();
  const monthOptions = getMonthOptions(locale);

  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [generationResult, setGenerationResult] =
    useState<GenerationResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const { templates, isPending: isLoadingTemplates } = useTemplates();
  const {
    shifts,
    isLoadingShifts,
    generatePlan,
    isGenerating,
    deleteGenerated,
    isDeleting,
  } = useGeneration(selectedMonth);

  const existingGeneratedCount = shifts.filter(
    (s: { source?: string }) => s.source === "GENERATED",
  ).length;

  const handleGenerate = useCallback(() => {
    if (!selectedTemplateId) return;

    if (existingGeneratedCount > 0) {
      setShowConfirm(true);
      return;
    }

    generatePlan(
      { month: selectedMonth, templateId: selectedTemplateId },
      {
        onSuccess: (result: GenerationResult) => {
          setGenerationResult(result);
        },
      },
    );
  }, [
    selectedMonth,
    selectedTemplateId,
    existingGeneratedCount,
    generatePlan,
  ]);

  const handleConfirmRegenerate = useCallback(() => {
    setShowConfirm(false);
    generatePlan(
      { month: selectedMonth, templateId: selectedTemplateId },
      {
        onSuccess: (result: GenerationResult) => {
          setGenerationResult(result);
        },
      },
    );
  }, [selectedMonth, selectedTemplateId, generatePlan]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6">
        <h2 className="text-lg font-bold text-neutral-900 mb-4">
          {t("title")}
        </h2>
        <p className="text-sm text-neutral-500 mb-6">{t("subtitle")}</p>

        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 min-w-[180px]">
            <label id="month-label" className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1.5 block">
              {t("monthLabel")}
            </label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger aria-labelledby="month-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[220px]">
            <label id="template-label" className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1.5 block">
              {t("templateLabel")}
            </label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
              disabled={isLoadingTemplates}
            >
              <SelectTrigger aria-labelledby="template-label">
                <SelectValue
                  placeholder={t("templatePlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                {templates.map(
                  (tpl: { id: string; name: string }) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!selectedTemplateId || isGenerating}
            className="bg-neutral-900 text-white shadow-lg hover:scale-[1.02] transition-transform font-bold"
          >
            {isGenerating ? (
              <Loader2 size={16} className="animate-spin mr-2" />
            ) : (
              <Sparkles size={16} className="text-yellow-300 mr-2" />
            )}
            {isGenerating ? t("generating") : t("generateButton")}
          </Button>
        </div>
      </div>

      {/* Generation result (ephemeral, after clicking generate) */}
      {generationResult && (
        <GenerationResultView result={generationResult} />
      )}

      {/* Persistent month summary (survives refresh) */}
      <MonthShiftsSummary
        shifts={shifts}
        isLoading={isLoadingShifts}
        onDeleteGenerated={() => deleteGenerated({ month: selectedMonth })}
        isDeleting={isDeleting}
      />

      <ConfirmRegenerateDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={handleConfirmRegenerate}
        existingCount={existingGeneratedCount}
      />
    </div>
  );
}
