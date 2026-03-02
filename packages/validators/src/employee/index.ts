export {
  JOB_TYPES,
  CONTRACT_TYPES,
  employeeFieldsSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  employeeIdSchema,
  listEmployeesSchema,
} from "./employee.schema";

export type {
  JobType,
  ContractType,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  EmployeeIdInput,
  ListEmployeesInput,
} from "./employee.schema";

export {
  UNAVAILABILITY_TYPES,
  createUnavailabilitySchema,
  updateUnavailabilitySchema,
  unavailabilityIdSchema,
  listUnavailabilitiesSchema,
  hardRuleRangeSchema,
} from "./unavailability.schema";

export type {
  UnavailabilityType,
  CreateUnavailabilityInput,
  UpdateUnavailabilityInput,
  UnavailabilityIdInput,
  ListUnavailabilitiesInput,
  HardRuleRangeInput,
} from "./unavailability.schema";

export {
  declareSchoolDaysSchema,
  listSchoolDaysSchema,
} from "./school-days.schema";

export type {
  DeclareSchoolDaysInput,
  ListSchoolDaysInput,
} from "./school-days.schema";

export {
  ABSENCE_TYPES,
  ABSENCE_STATUSES,
  createAbsenceRequestSchema,
  reviewAbsenceSchema,
  listAbsencesSchema,
  absenceIdSchema,
  adminCreateAbsenceSchema,
  checkAbsenceOverlapSchema,
} from "./absence.schema";

export type {
  AbsenceType,
  AbsenceStatus,
  CreateAbsenceRequestInput,
  ReviewAbsenceInput,
  ListAbsencesInput,
  AbsenceIdInput,
  AdminCreateAbsenceInput,
  CheckAbsenceOverlapInput,
} from "./absence.schema";

export {
  updateNotificationPreferencesSchema,
  notificationPreferencesResponseSchema,
} from "./notification-preferences.schema";

export type {
  UpdateNotificationPreferencesInput,
  NotificationPreferencesResponse,
} from "./notification-preferences.schema";
