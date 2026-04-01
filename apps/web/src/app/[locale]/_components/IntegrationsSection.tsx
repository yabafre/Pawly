"use client";

import { useRef } from "react";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import {
  Users,
  ShieldCheck,
  LayoutTemplate,
  CalendarCheck,
  BellRing,
  Scale,
} from "lucide-react";
import { useTranslations } from "next-intl";

function Circle({
  children,
  className,
  ref,
}: {
  children: React.ReactNode;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={`z-10 flex h-12 w-12 items-center justify-center rounded-full border bg-card shadow-sm ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function PawlyCenter({ ref }: { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className="z-10 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-primary/30 bg-primary/10 shadow-md"
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-primary">
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

export function IntegrationsSection() {
  const t = useTranslations("landing.workflow");

  const containerRef = useRef<HTMLDivElement>(null);
  const employeesRef = useRef<HTMLDivElement>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const scheduleRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const equityRef = useRef<HTMLDivElement>(null);

  const inputNodes = [
    { ref: employeesRef, icon: Users, label: t("steps.employees"), color: "text-blue-600" },
    { ref: constraintsRef, icon: ShieldCheck, label: t("steps.constraints"), color: "text-orange-600" },
    { ref: templatesRef, icon: LayoutTemplate, label: t("steps.templates"), color: "text-purple-600" },
  ];

  const outputNodes = [
    { ref: scheduleRef, icon: CalendarCheck, label: t("steps.schedule"), color: "text-primary" },
    { ref: notificationsRef, icon: BellRing, label: t("steps.notifications"), color: "text-rose-600" },
    { ref: equityRef, icon: Scale, label: t("steps.equity"), color: "text-amber-600" },
  ];

  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
            {t("badge")}
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">
            {t("title")}
          </h2>
          <p className="text-muted-foreground mt-3 text-sm max-w-xl mx-auto">
            {t("subtitle")}
          </p>
        </div>

        <div className="flex justify-center">
          <div
            className="relative flex h-[340px] w-full max-w-3xl items-center justify-center rounded-2xl border bg-card p-8 overflow-hidden"
            ref={containerRef}
          >
            <div className="flex h-full w-full items-center justify-between gap-6">
              {/* Left: Inputs */}
              <div className="flex flex-col items-center gap-8">
                {inputNodes.map(({ ref, icon: Icon, label, color }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5">
                    <Circle ref={ref}>
                      <Icon className={`w-5 h-5 ${color}`} />
                    </Circle>
                    <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Center: Pawly */}
              <div className="flex flex-col items-center gap-2">
                <PawlyCenter ref={centerRef} />
                <span className="text-xs font-bold text-primary">Pawly</span>
              </div>

              {/* Right: Outputs */}
              <div className="flex flex-col items-center gap-8">
                {outputNodes.map(({ ref, icon: Icon, label, color }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5">
                    <Circle ref={ref}>
                      <Icon className={`w-5 h-5 ${color}`} />
                    </Circle>
                    <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Beams: Inputs → Center */}
            <AnimatedBeam
              containerRef={containerRef as React.RefObject<HTMLElement>}
              fromRef={employeesRef as React.RefObject<HTMLElement>}
              toRef={centerRef as React.RefObject<HTMLElement>}
              curvature={-60}
              endYOffset={-10}
              pathColor="rgba(0,0,0,0.06)"
              gradientStartColor="#3B82F6"
              gradientStopColor="#009588"
            />
            <AnimatedBeam
              containerRef={containerRef as React.RefObject<HTMLElement>}
              fromRef={constraintsRef as React.RefObject<HTMLElement>}
              toRef={centerRef as React.RefObject<HTMLElement>}
              pathColor="rgba(0,0,0,0.06)"
              gradientStartColor="#F97316"
              gradientStopColor="#009588"
            />
            <AnimatedBeam
              containerRef={containerRef as React.RefObject<HTMLElement>}
              fromRef={templatesRef as React.RefObject<HTMLElement>}
              toRef={centerRef as React.RefObject<HTMLElement>}
              curvature={60}
              endYOffset={10}
              pathColor="rgba(0,0,0,0.06)"
              gradientStartColor="#A855F7"
              gradientStopColor="#009588"
            />

            {/* Beams: Center → Outputs */}
            <AnimatedBeam
              containerRef={containerRef as React.RefObject<HTMLElement>}
              fromRef={centerRef as React.RefObject<HTMLElement>}
              toRef={scheduleRef as React.RefObject<HTMLElement>}
              curvature={-60}
              startYOffset={-10}
              pathColor="rgba(0,0,0,0.06)"
              gradientStartColor="#009588"
              gradientStopColor="#009588"
            />
            <AnimatedBeam
              containerRef={containerRef as React.RefObject<HTMLElement>}
              fromRef={centerRef as React.RefObject<HTMLElement>}
              toRef={notificationsRef as React.RefObject<HTMLElement>}
              pathColor="rgba(0,0,0,0.06)"
              gradientStartColor="#009588"
              gradientStopColor="#F43F5E"
            />
            <AnimatedBeam
              containerRef={containerRef as React.RefObject<HTMLElement>}
              fromRef={centerRef as React.RefObject<HTMLElement>}
              toRef={equityRef as React.RefObject<HTMLElement>}
              curvature={60}
              startYOffset={10}
              pathColor="rgba(0,0,0,0.06)"
              gradientStartColor="#009588"
              gradientStopColor="#F59E0B"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
