"use client";

import { PawlyLogo } from "@/components/pawly-logo";
import { Dog, Cat, PawPrint } from "lucide-react";
import { useEffect, useState } from "react";

export function RunningPetSplash() {
    // We use a small randomizer so the user is sometimes greeted by a Dog, sometimes a Cat!
    const [isDog, setIsDog] = useState(true);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setIsDog(Math.random() > 0.5);
        setMounted(true);
    }, []);

    const Pet = isDog ? Dog : Cat;

    return (
        <div role="status" aria-label="Loading" className="fixed inset-0 z-[100] bg-[#FDFDFD] flex flex-col items-center justify-center">
            <style>{`
                @keyframes pet-run {
                    0% { transform: translateY(0) rotate(-5deg); }
                    50% { transform: translateY(-16px) rotate(10deg); }
                    100% { transform: translateY(0) rotate(-5deg); }
                }
                @keyframes ground-move {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                @media (prefers-reduced-motion: reduce) {
                    * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
                }
            `}</style>

            <div className="flex flex-col items-center justify-center gap-10">
                <div className="motion-safe:animate-pulse">
                    <PawlyLogo className="scale-[1.5]" theme="light" />
                </div>

                {/* Pet Run Container */}
                <div className="relative w-64 h-20 flex items-end justify-center overflow-hidden opacity-90 mt-4">
                    {/* Gradient masks for smooth edges so icons fade out */}
                    <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#FDFDFD] to-transparent z-20" />
                    <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#FDFDFD] to-transparent z-20" />

                    {/* The Bouncing Pet */}
                    {mounted && (
                        <div className="z-10 pb-3 text-neutral-900 drop-shadow-sm" style={{ animation: "pet-run 0.45s infinite cubic-bezier(0.4, 0, 0.2, 1)" }}>
                            <Pet size={48} strokeWidth={2.5} />
                        </div>
                    )}

                    {/* The Scrolling Ground (Paws and dots) - Duplicated to create seamless loop -> 200% width */}
                    <div className="absolute bottom-0 left-0 w-[200%] flex items-center justify-around text-neutral-300 pb-1.5" style={{ animation: "ground-move 1.5s infinite linear" }}>
                        {/* Segment 1 */}
                        <PawPrint size={18} className="-rotate-45" />
                        <div className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
                        <PawPrint size={14} className="rotate-12" />
                        <div className="w-2 h-2 rounded-full bg-neutral-200" />
                        <PawPrint size={18} className="-rotate-[30deg]" />
                        <div className="w-1 h-1 rounded-full bg-neutral-200" />
                        <PawPrint size={14} className="-rotate-12" />
                        <div className="w-2 h-2 rounded-full bg-neutral-200" />

                        {/* Segment 2 (Exact copy for loop) */}
                        <PawPrint size={18} className="-rotate-45" />
                        <div className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
                        <PawPrint size={14} className="rotate-12" />
                        <div className="w-2 h-2 rounded-full bg-neutral-200" />
                        <PawPrint size={18} className="-rotate-[30deg]" />
                        <div className="w-1 h-1 rounded-full bg-neutral-200" />
                        <PawPrint size={14} className="-rotate-12" />
                        <div className="w-2 h-2 rounded-full bg-neutral-200" />
                    </div>
                </div>
            </div>
        </div>
    );
}
