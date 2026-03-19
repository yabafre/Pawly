"use client";

import { useState } from "react";
import { GenerationPanel } from "./GenerationPanel";
import { ApprenticeDeclarationPanel } from "./ApprenticeDeclarationPanel";
import { ScheduleViewWrapper } from "./ScheduleViewWrapper";

function getDefaultMonth() {
  return new Date().toISOString().slice(0, 7);
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
