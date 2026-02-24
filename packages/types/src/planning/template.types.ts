export interface TemplateSlot {
  shiftTypeCode: string;
  requiredStaff: number;
  requiredJobTypes?: string[];
}

export interface TemplateDay {
  dayOfWeek: number;
  slots: TemplateSlot[];
}

export interface TemplateData {
  days: TemplateDay[];
}

export interface TemplateRecord {
  id: string;
  name: string;
  data: unknown;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface EditableTemplate {
  id: string;
  name: string;
  data: TemplateData;
}
