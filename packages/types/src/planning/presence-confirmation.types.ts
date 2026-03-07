export interface ConfirmShiftResult {
  shiftId: string;
  isConfirmed: boolean;
  deltaMinutes: number;
  varianceType: "CLOCK_IN_DEVIATION";
}
