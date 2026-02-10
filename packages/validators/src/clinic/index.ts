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
} from "./onboarding.schema";
export {
  clinicClosedDayInputSchema,
  clinicSpecialDayInputSchema,
  updateClinicOperationalConfigSchema,
  clinicClosedDaySchema,
  clinicSpecialDaySchema,
  clinicOperationalConfigSchema,
} from "./operational-config.schema";

export type {
  WorkDay,
  UpdateClinicNameInput,
  UpdateWorkDaysInput,
  UpdateWorkHoursInput,
  UpdateClinicConfigInput,
  CreateShiftTypesInput,
  CompleteOnboardingInput,
} from "./onboarding.schema";
export type {
  ClinicClosedDayInput,
  ClinicSpecialDayInput,
  UpdateClinicOperationalConfigInput,
  ClinicOperationalConfig,
} from "./operational-config.schema";
