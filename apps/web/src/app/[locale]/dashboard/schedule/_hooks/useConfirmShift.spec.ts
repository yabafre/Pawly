import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMutate = vi.fn();
const mockCancelQueries = vi.fn();
const mockGetQueryData = vi.fn();
const mockSetQueryData = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock("@/lib/hooks/server-action-hooks", () => ({
  QueryKeyFactory: {
    mySchedule: (month?: string) => ["my-schedule", month ?? "current"],
  },
  useServerActionMutation: vi.fn((_action: unknown, opts: Record<string, unknown>) => {
    return {
      mutate: (input: unknown) => {
        mockMutate(input);
        if (opts?.onMutate) (opts.onMutate as (input: unknown) => void)(input);
        if (opts?.onSuccess) (opts.onSuccess as (data: unknown) => void)({ shiftId: "s1", isConfirmed: true, deltaMinutes: 0, varianceType: "CLOCK_IN_DEVIATION" });
        if (opts?.onSettled) (opts.onSettled as () => void)();
      },
      isPending: false,
    };
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    cancelQueries: mockCancelQueries,
    getQueryData: mockGetQueryData,
    setQueryData: mockSetQueryData,
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    if (vars) return `${key}:${JSON.stringify(vars)}`;
    return key;
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { renderHook } from "@testing-library/react";
import { useConfirmShift } from "./useConfirmShift";

describe("useConfirmShift", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, writable: true });
  });

  it("should return confirmShift function and isPending", () => {
    const { result } = renderHook(() => useConfirmShift("2026-02"));

    expect(result.current.confirmShift).toBeDefined();
    expect(typeof result.current.confirmShift).toBe("function");
    expect(result.current.isPending).toBe(false);
  });

  it("should call mutation with shiftId", () => {
    const { result } = renderHook(() => useConfirmShift("2026-02"));

    result.current.confirmShift({ shiftId: "shift-1" });

    expect(mockMutate).toHaveBeenCalledWith({ shiftId: "shift-1" });
  });

  it("should call confirmShift and trigger onSettled", () => {
    const { result } = renderHook(() => useConfirmShift("2026-02"));
    result.current.confirmShift({ shiftId: "shift-1" });

    // onSettled invalidates queries
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["my-schedule"],
    });
  });

  it("should invalidate my-schedule queries on settled", () => {
    const { result } = renderHook(() => useConfirmShift("2026-02"));
    result.current.confirmShift({ shiftId: "shift-1" });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["my-schedule"],
    });
  });

  it("should call success toast when deltaMinutes is 0 (on-time)", async () => {
    const { toast } = await import("sonner");
    const { result } = renderHook(() => useConfirmShift("2026-02"));
    result.current.confirmShift({ shiftId: "shift-1" });

    expect(toast.success).toHaveBeenCalled();
    // No double toast — info should NOT be called for on-time
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("should call deviation toast instead of success when deltaMinutes != 0", async () => {
    // Override mock to return non-zero deltaMinutes
    const { useServerActionMutation } = await import("@/lib/hooks/server-action-hooks");
    (useServerActionMutation as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_action: unknown, opts: Record<string, unknown>) => ({
        mutate: (input: unknown) => {
          mockMutate(input);
          if (opts?.onMutate) (opts.onMutate as (input: unknown) => void)(input);
          if (opts?.onSuccess) (opts.onSuccess as (data: unknown) => void)({
            shiftId: "s1",
            isConfirmed: true,
            deltaMinutes: 30,
            varianceType: "CLOCK_IN_DEVIATION",
          });
          if (opts?.onSettled) (opts.onSettled as () => void)();
        },
        isPending: false,
      }),
    );

    const { toast } = await import("sonner");
    const { result } = renderHook(() => useConfirmShift("2026-02"));
    result.current.confirmShift({ shiftId: "shift-1" });

    // Deviation toast shown, no success toast
    expect(toast.info).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("should work with month parameter", () => {
    const { result } = renderHook(() => useConfirmShift("2026-03"));
    expect(result.current.confirmShift).toBeDefined();
  });

  it("should work without month parameter", () => {
    const { result } = renderHook(() => useConfirmShift());
    expect(result.current.confirmShift).toBeDefined();
  });
});
