import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OtpInput } from "./OtpInput";

describe("OtpInput", () => {
  // ── Rendering ─────────────────────────────────────────────────────────

  it("renders 6 input fields", () => {
    render(<OtpInput onComplete={vi.fn()} />);

    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`otp-input-${i}`)).toBeDefined();
    }
  });

  it("renders clear button when not disabled", () => {
    render(<OtpInput onComplete={vi.fn()} />);

    expect(screen.getByTestId("otp-clear")).toBeDefined();
  });

  it("hides clear button when disabled", () => {
    render(<OtpInput onComplete={vi.fn()} disabled />);

    expect(screen.queryByTestId("otp-clear")).toBeNull();
  });

  it("sets disabled attribute on all inputs when disabled", () => {
    render(<OtpInput onComplete={vi.fn()} disabled />);

    for (let i = 0; i < 6; i++) {
      const input = screen.getByTestId(`otp-input-${i}`) as HTMLInputElement;
      expect(input.disabled).toBe(true);
    }
  });

  it("has inputMode numeric on all inputs", () => {
    render(<OtpInput onComplete={vi.fn()} />);

    for (let i = 0; i < 6; i++) {
      const input = screen.getByTestId(`otp-input-${i}`);
      expect(input.getAttribute("inputmode")).toBe("numeric");
    }
  });

  it("has role group with aria-label", () => {
    render(<OtpInput onComplete={vi.fn()} />);

    const group = screen.getByRole("group");
    expect(group).toBeDefined();
    expect(group.getAttribute("aria-label")).toBe("enterCode");
  });

  it("sets autoComplete one-time-code only on first input", () => {
    render(<OtpInput onComplete={vi.fn()} />);

    const first = screen.getByTestId("otp-input-0");
    expect(first.getAttribute("autocomplete")).toBe("one-time-code");

    const second = screen.getByTestId("otp-input-1");
    expect(second.getAttribute("autocomplete")).toBe("off");
  });

  // ── Input behavior ────────────────────────────────────────────────────

  it("accepts a single digit", () => {
    render(<OtpInput onComplete={vi.fn()} />);

    const input = screen.getByTestId("otp-input-0") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "4" } });

    expect(input.value).toBe("4");
  });

  it("rejects non-numeric input", () => {
    render(<OtpInput onComplete={vi.fn()} />);

    const input = screen.getByTestId("otp-input-0") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "a" } });

    expect(input.value).toBe("");
  });

  it("truncates multi-character input to last digit", () => {
    render(<OtpInput onComplete={vi.fn()} />);

    const input = screen.getByTestId("otp-input-0") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "42" } });

    expect(input.value).toBe("2");
  });

  // ── Completion callback ───────────────────────────────────────────────

  it("calls onComplete when all 6 digits are filled", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    // Fill first 5 fields
    for (let i = 0; i < 5; i++) {
      const input = screen.getByTestId(`otp-input-${i}`) as HTMLInputElement;
      fireEvent.change(input, { target: { value: String(i + 1) } });
    }

    // Fill last field — should trigger onComplete
    const lastInput = screen.getByTestId("otp-input-5") as HTMLInputElement;
    fireEvent.change(lastInput, { target: { value: "6" } });

    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("does not call onComplete when fewer than 6 digits", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    for (let i = 0; i < 4; i++) {
      const input = screen.getByTestId(`otp-input-${i}`) as HTMLInputElement;
      fireEvent.change(input, { target: { value: String(i + 1) } });
    }

    expect(onComplete).not.toHaveBeenCalled();
  });

  // ── Paste handling ────────────────────────────────────────────────────

  it("distributes pasted 6-digit code and calls onComplete", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    const firstInput = screen.getByTestId("otp-input-0");
    fireEvent.paste(firstInput, {
      clipboardData: { getData: () => "428715" },
    });

    for (let i = 0; i < 6; i++) {
      const input = screen.getByTestId(`otp-input-${i}`) as HTMLInputElement;
      expect(input.value).toBe("428715"[i]);
    }

    expect(onComplete).toHaveBeenCalledWith("428715");
  });

  it("strips non-digit characters from paste data", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    const firstInput = screen.getByTestId("otp-input-0");
    fireEvent.paste(firstInput, {
      clipboardData: { getData: () => "4 2 8 7 1 5" },
    });

    expect(onComplete).toHaveBeenCalledWith("428715");
  });

  it("handles partial paste (fewer than 6 digits)", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    const firstInput = screen.getByTestId("otp-input-0");
    fireEvent.paste(firstInput, {
      clipboardData: { getData: () => "42" },
    });

    const input0 = screen.getByTestId("otp-input-0") as HTMLInputElement;
    const input1 = screen.getByTestId("otp-input-1") as HTMLInputElement;
    expect(input0.value).toBe("4");
    expect(input1.value).toBe("2");

    expect(onComplete).not.toHaveBeenCalled();
  });

  it("ignores paste with no digits", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    const firstInput = screen.getByTestId("otp-input-0");
    fireEvent.paste(firstInput, {
      clipboardData: { getData: () => "abcdef" },
    });

    const input0 = screen.getByTestId("otp-input-0") as HTMLInputElement;
    expect(input0.value).toBe("");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("handles paste on non-first input (distributes from index 0)", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    const thirdInput = screen.getByTestId("otp-input-2");
    fireEvent.paste(thirdInput, {
      clipboardData: { getData: () => "428715" },
    });

    for (let i = 0; i < 6; i++) {
      const input = screen.getByTestId(`otp-input-${i}`) as HTMLInputElement;
      expect(input.value).toBe("428715"[i]);
    }

    expect(onComplete).toHaveBeenCalledWith("428715");
  });

  // ── Keyboard navigation ───────────────────────────────────────────────

  it("focuses previous input on backspace when current is empty", () => {
    render(<OtpInput onComplete={vi.fn()} />);

    const input1 = screen.getByTestId("otp-input-1") as HTMLInputElement;
    input1.focus();

    fireEvent.keyDown(input1, { key: "Backspace" });

    expect(document.activeElement).toBe(screen.getByTestId("otp-input-0"));
  });

  it("does not focus previous on backspace for first input", () => {
    render(<OtpInput onComplete={vi.fn()} />);

    const input0 = screen.getByTestId("otp-input-0") as HTMLInputElement;
    input0.focus();

    fireEvent.keyDown(input0, { key: "Backspace" });

    expect(document.activeElement).toBe(input0);
  });

  // ── Clear all ─────────────────────────────────────────────────────────

  it("clears all inputs and focuses first on clear click", () => {
    render(<OtpInput onComplete={vi.fn()} />);

    // Fill some inputs first
    for (let i = 0; i < 3; i++) {
      const input = screen.getByTestId(`otp-input-${i}`) as HTMLInputElement;
      fireEvent.change(input, { target: { value: String(i + 1) } });
    }

    fireEvent.click(screen.getByTestId("otp-clear"));

    for (let i = 0; i < 6; i++) {
      const input = screen.getByTestId(`otp-input-${i}`) as HTMLInputElement;
      expect(input.value).toBe("");
    }

    expect(document.activeElement).toBe(screen.getByTestId("otp-input-0"));
  });
});
