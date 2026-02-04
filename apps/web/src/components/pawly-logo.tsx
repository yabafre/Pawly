import { cn } from "@/lib/utils";
import { PawPrint } from "lucide-react";

export function PawlyLogo({ className, iconClassName }: { className?: string, iconClassName?: string }) {
    return (
        <div className={cn("flex items-center gap-3", className)}>
            <div
                className={cn(
                    "w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center shadow-lg shadow-neutral-900/10 relative overflow-hidden group shrink-0",
                    iconClassName
                )}
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent"></div>
                <PawPrint className="w-5 h-5 text-white relative z-10 fill-current" />
            </div>
            <span className="text-2xl font-bold tracking-tighter text-neutral-900 leading-none">Pawly</span>
        </div>
    );
}
