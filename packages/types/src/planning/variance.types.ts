export interface VarianceEventItem {
  id: string;
  type: string;
  status: string;
  plannedTime: string;
  actualTime: string;
  deltaMinutes: number;
  exceptionNote?: string | null;
  shift: {
    shiftTypeCode: string;
    startTime: string;
    endTime: string;
    date: string;
    employee: {
      id: string;
      firstName: string;
      lastName: string;
      jobType: string;
    };
  };
}
