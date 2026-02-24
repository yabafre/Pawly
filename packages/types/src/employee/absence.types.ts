export interface AbsenceItem {
  id: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  rejectionReason?: string | null;
  employee?: { firstName: string; lastName: string; jobType?: string };
}
