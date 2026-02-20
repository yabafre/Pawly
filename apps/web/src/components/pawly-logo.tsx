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
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shadow-lg relative overflow-hidden group shrink-0",
          theme === "dark"
            ? "bg-white shadow-white/10"
            : "bg-neutral-900 shadow-neutral-900/10",
          iconClassName
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent" />
        <PawPrint
          className={cn(
            "w-5 h-5 relative z-10 fill-current",
            theme === "dark" ? "text-neutral-900" : "text-white"
          )}
        />
      </div>
      <span
        className={cn(
          "text-2xl font-bold tracking-tighter leading-none",
          theme === "dark" ? "text-white" : "text-neutral-900"
        )}
      >
        Pawly
      </span>
    </div>
  );
}
