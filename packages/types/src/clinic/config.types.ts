export interface ClosedDayItem {
  date: string;
  reason: string;
}

export interface SpecialDayItem {
  date: string;
  startTime: string;
  endTime: string;
  label: string;
}

export interface OnboardingInitialData {
  clinicName: string;
  config: {
    workDays: string[];
    defaultStartTime: string;
    defaultEndTime: string;
  } | null;
  shiftTypes: Array<{
    name: string;
    code: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    color: string;
  }>;
}
