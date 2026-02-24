export interface DashboardStats {
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
}
