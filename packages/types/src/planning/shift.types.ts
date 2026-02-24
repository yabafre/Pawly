export interface ShiftData {
  id: string;
  date: Date | string;
  startTime: string;
  endTime: string;
  shiftTypeCode: string;
  source: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    color?: string | null;
    jobType: string;
  } | null;
}
