"use client";

import { useTranslations } from "next-intl";
import { Clock, Layers } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClinicOperationalConfigPanel } from "./ClinicOperationalConfigPanel";
import { ShiftTypesPanel } from "./ShiftTypesPanel";

export function SettingsTabs() {
  const t = useTranslations("settings");

  return (
    <Tabs defaultValue="operational" className="space-y-6">
      <TabsList className="h-auto gap-1 rounded-2xl bg-neutral-100 p-1">
        <TabsTrigger
          value="operational"
          className="gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
        >
          <Clock className="h-4 w-4" strokeWidth={1.5} />
          {t("tabs.operational")}
        </TabsTrigger>
        <TabsTrigger
          value="shiftTypes"
          className="gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
        >
          <Layers className="h-4 w-4" strokeWidth={1.5} />
          {t("tabs.shiftTypes")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="operational">
        <ClinicOperationalConfigPanel />
      </TabsContent>

      <TabsContent value="shiftTypes">
        <ShiftTypesPanel />
      </TabsContent>
    </Tabs>
  );
}
