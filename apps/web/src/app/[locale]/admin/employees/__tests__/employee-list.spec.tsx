import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmployeeList } from "../_components/EmployeeList";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    return t;
  },
}));

vi.mock("nuqs", () => {
  const createParser = (defaultValue: unknown) => ({
    defaultValue,
    withOptions: () => ({ defaultValue }),
  });

  return {
    parseAsString: {
      withDefault: (defaultValue: string) => createParser(defaultValue),
    },
    parseAsBoolean: {
      withDefault: (defaultValue: boolean) => createParser(defaultValue),
    },
    useQueryState: (_key: string, parser: { defaultValue?: unknown }) => [
      parser?.defaultValue ?? null,
      vi.fn(),
    ],
  };
});

// Mock hooks
const mockEmployees: any[] = [];
const mockUseEmployees = vi.fn().mockReturnValue({
  employees: mockEmployees,
  isPending: false,
  error: null,
});
const mockCreateEmployee = vi.fn();
const mockUpdateEmployee = vi.fn();
const mockToggleActive = vi.fn();

vi.mock("../_hooks/useEmployees", () => ({
  useEmployees: (...args: any[]) => mockUseEmployees(...args),
  useCreateEmployee: () => ({
    createEmployee: mockCreateEmployee,
    isPending: false,
    error: null,
  }),
  useUpdateEmployee: () => ({
    updateEmployee: mockUpdateEmployee,
    isPending: false,
    error: null,
  }),
  useToggleEmployeeActive: () => ({
    toggleActive: mockToggleActive,
    isPending: false,
    error: null,
  }),
}));

// Mock @tanstack/react-query
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

// Mock @pawly/validators
vi.mock("@pawly/validators", () => ({
  JOB_TYPES: ["VET", "ASV", "APPRENTICE"],
  CONTRACT_TYPES: ["CDI", "CDD", "APPRENTICESHIP"],
}));

// Mock UI components used in EmployeeList
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

describe("EmployeeList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no employees", () => {
    mockUseEmployees.mockReturnValue({
      employees: [],
      isPending: false,
      error: null,
    });

    render(<EmployeeList />);

    expect(screen.getByText("empty.title")).toBeDefined();
    expect(screen.getByText("empty.description")).toBeDefined();
  });

  it("shows loading state when pending", () => {
    mockUseEmployees.mockReturnValue({
      employees: [],
      isPending: true,
      error: null,
    });

    render(<EmployeeList />);

    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders employee cards when employees exist", () => {
    const employees = [
      {
        id: "1",
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean@clinic.fr",
        phone: null,
        jobType: "VET",
        contractType: "CDI",
        contractHours: 35,
        color: "#3b82f6",
        isActive: true,
        hireDate: null,
        endDate: null,
      },
      {
        id: "2",
        firstName: "Marie",
        lastName: "Martin",
        email: null,
        phone: null,
        jobType: "ASV",
        contractType: "CDD",
        contractHours: 20,
        color: "#FF5733",
        isActive: true,
        hireDate: null,
        endDate: null,
      },
    ];

    mockUseEmployees.mockReturnValue({
      employees,
      isPending: false,
      error: null,
    });

    render(<EmployeeList />);

    expect(screen.getByText("Jean Dupont")).toBeDefined();
    expect(screen.getByText("Marie Martin")).toBeDefined();
  });

  it("shows Add Employee button", () => {
    mockUseEmployees.mockReturnValue({
      employees: [],
      isPending: false,
      error: null,
    });

    render(<EmployeeList />);

    // In empty state, the CTA button text should be present
    expect(screen.getByText("empty.cta")).toBeDefined();
  });
});
