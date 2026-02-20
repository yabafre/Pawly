"use client";

import { useState } from "react";
import { GenerationPanel } from "./GenerationPanel";
import { ApprenticeDeclarationPanel } from "./ApprenticeDeclarationPanel";
import { ScheduleViewWrapper } from "./ScheduleViewWrapper";

function getDefaultMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function PlanningPageClient() {
  const [selectedMonth, setSelectedMonth] = useState(getDefaultMonth);

  return (
    <>
      <GenerationPanel month={selectedMonth} onMonthChange={setSelectedMonth} />
      <ApprenticeDeclarationPanel month={selectedMonth} />
      <ScheduleViewWrapper month={selectedMonth} />
    </>
  );
}
