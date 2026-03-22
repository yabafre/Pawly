export interface TodayEmployee {
  id: string;
  firstName: string;
  lastName: string;
  jobType: string;
  startTime: string;
  endTime: string;
}

export interface DashboardStats {
  clinicName: string;
  activeEmployees: number;
  jobTypeBreakdown: Record<string, number>;
  pendingRequests: number;
  pendingAbsences: number;
  pendingVariances: number;
  monthlyPlannedHours: number;
  totalShifts: number;
  weekNumber: number;
  undeclaredApprenticeCount: number;
  monthLabel: string;
  coveragePercent: number | null;
  todayEmployees: TodayEmployee[];
}
