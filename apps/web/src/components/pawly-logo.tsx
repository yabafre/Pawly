import { cn } from "@/lib/utils";
import { PawPrint } from "lucide-react";

export function PawlyLogo({
  className,
  iconClassName,
  theme = "light",
}: {
  className?: string;
  iconClassName?: string;
  theme?: "light" | "dark";
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center relative overflow-hidden shrink-0",
          theme === "dark"
            ? "bg-white"
            : "bg-neutral-900",
          iconClassName
        )}
      >
        <PawPrint
          className={cn(
            "w-3.5 h-3.5 relative z-10 fill-current",
            theme === "dark" ? "text-neutral-900" : "text-white"
          )}
        />
      </div>
      <span
        className={cn(
          "text-sm font-semibold tracking-tight leading-none",
          theme === "dark" ? "text-white" : "text-neutral-900"
        )}
      >
        Pawly
      </span>
    </div>
  );
}
