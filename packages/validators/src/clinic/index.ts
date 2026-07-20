export {
  WORK_DAYS,
  updateClinicNameSchema,
  updateWorkDaysSchema,
  updateWorkHoursSchema,
  workHoursFieldsSchema,
  updateClinicConfigSchema,
  shiftTypeFieldsSchema,
  shiftTypeSchema,
  createShiftTypesSchema,
  completeOnboardingSchema,
  timeRegex,
  shiftBreakRuleOk,
  MANDATORY_BREAK_MINUTES,
  BREAK_REQUIRED_AFTER_NET_MINUTES,
} from './onboarding.schema';
export {
  clinicClosedDayInputSchema,
  clinicSpecialDayInputSchema,
  updateClinicOperationalConfigSchema,
  clinicClosedDaySchema,
  clinicSpecialDaySchema,
  clinicOperationalConfigSchema,
} from './operational-config.schema';
export {
  createShiftTypeSchema,
  updateShiftTypeSchema,
  deleteShiftTypeSchema,
  listShiftTypesSchema,
} from './shift-type.schema';

export type {
  WorkDay,
  UpdateClinicNameInput,
  UpdateWorkDaysInput,
  UpdateWorkHoursInput,
  UpdateClinicConfigInput,
  CreateShiftTypesInput,
  CompleteOnboardingInput,
} from './onboarding.schema';
export type {
  ClinicClosedDayInput,
  ClinicSpecialDayInput,
  UpdateClinicOperationalConfigInput,
  ClinicOperationalConfig,
} from './operational-config.schema';
export type {
  CreateShiftTypeInput,
  UpdateShiftTypeInput,
  DeleteShiftTypeInput,
  ListShiftTypesInput,
} from './shift-type.schema';
