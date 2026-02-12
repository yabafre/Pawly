import React from "react";

export function Atmosphere() {
    return (
        <div className="fixed inset-0 w-full h-full overflow-hidden -z-50 pointer-events-none">
            {/* Clinique Zen: White/Teal base is handled by bg-background in globals.css */}

            {/* Touches Chaleureuses (Orange) & Depth (Indigo) */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-orange-500/5 blur-[120px]" />
        </div>
    );
}
