export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobType: string;
  contractType: string;
  contractHours: number;
  color: string;
  isActive: boolean;
  hireDate: string | null;
  endDate: string | null;
}

export interface EmployeeSummary {
  id: string;
  firstName: string;
  lastName: string;
  jobType: string;
}
