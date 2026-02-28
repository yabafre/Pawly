"use client";

import { useRef, useCallback, forwardRef, useImperativeHandle, type KeyboardEvent, type ClipboardEvent, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";

export interface OtpInputHandle {
    clear: () => void;
}

interface OtpInputProps {
    onComplete: (code: string) => void;
    disabled?: boolean;
}

const OTP_LENGTH = 6;

export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(
    ({ onComplete, disabled = false }, ref) => {
        const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
        const t = useTranslations("auth.otp");

        const focusInput = useCallback((index: number) => {
            inputRefs.current[index]?.focus();
        }, []);

        const getOtpValue = useCallback(() => {
            return inputRefs.current.map((input) => input?.value ?? "").join("");
        }, []);

        const clearAll = useCallback(() => {
            inputRefs.current.forEach((input) => {
                if (input) input.value = "";
            });
            focusInput(0);
        }, [focusInput]);

        useImperativeHandle(ref, () => ({
            clear: clearAll,
        }), [clearAll]);

        const handleChange = useCallback(
            (index: number) => (e: ChangeEvent<HTMLInputElement>) => {
                const value = e.target.value;

                // Only allow single digit
                if (value.length > 1) {
                    e.target.value = value.slice(-1);
                }

                // Reject non-numeric
                if (value && !/^\d$/.test(e.target.value)) {
                    e.target.value = "";
                    return;
                }

                // Auto-focus next field
                if (value && index < OTP_LENGTH - 1) {
                    focusInput(index + 1);
                }

                // Check if all fields are filled
                const otp = getOtpValue();
                if (otp.length === OTP_LENGTH && /^\d{6}$/.test(otp)) {
                    onComplete(otp);
                }
            },
            [focusInput, getOtpValue, onComplete],
        );

        const handleKeyDown = useCallback(
            (index: number) => (e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Backspace") {
                    const input = inputRefs.current[index];
                    if (input && !input.value && index > 0) {
                        focusInput(index - 1);
                    }
                }
            },
            [focusInput],
        );

        const handlePaste = useCallback(
            (e: ClipboardEvent<HTMLInputElement>) => {
                e.preventDefault();
                const pastedData = e.clipboardData.getData("text").trim();
                const digits = pastedData.replace(/\D/g, "").slice(0, OTP_LENGTH);

                if (digits.length === 0) return;

                digits.split("").forEach((digit, i) => {
                    const input = inputRefs.current[i];
                    if (input) {
                        input.value = digit;
                    }
                });

                // Focus the next empty field or last field
                const nextEmptyIndex = digits.length < OTP_LENGTH ? digits.length : OTP_LENGTH - 1;
                focusInput(nextEmptyIndex);

                // Check completion
                if (digits.length === OTP_LENGTH) {
                    onComplete(digits);
                }
            },
            [focusInput, onComplete],
        );

        return (
            <div className="flex flex-col items-center gap-4">
                <div className="flex gap-3" role="group" aria-label={t("enterCode")}>
                    {Array.from({ length: OTP_LENGTH }, (_, i) => (
                        <input
                            key={i}
                            ref={(el) => {
                                inputRefs.current[i] = el;
                            }}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]"
                            autoComplete={i === 0 ? "one-time-code" : "off"}
                            maxLength={1}
                            disabled={disabled}
                            aria-label={`${t("placeholder")} ${i + 1} / ${OTP_LENGTH}`}
                            className="w-12 h-14 text-center text-2xl font-bold font-mono border-2 border-neutral-200 rounded-xl bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            onChange={handleChange(i)}
                            onKeyDown={handleKeyDown(i)}
                            onPaste={handlePaste}
                            data-testid={`otp-input-${i}`}
                        />
                    ))}
                </div>
                {!disabled && (
                    <button
                        type="button"
                        onClick={clearAll}
                        className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                        data-testid="otp-clear"
                    >
                        {t("back")}
                    </button>
                )}
            </div>
        );
    },
);

OtpInput.displayName = "OtpInput";
