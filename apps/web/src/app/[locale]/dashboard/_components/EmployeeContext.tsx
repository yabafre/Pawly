"use client";

import { createContext, useContext, useMemo } from "react";

interface EmployeeContextValue {
    employeeId: string;
    jobType: string;
}

const EmployeeContext = createContext<EmployeeContextValue | null>(null);

export function EmployeeProvider({
    children,
    employeeId,
    jobType,
}: {
    children: React.ReactNode;
    employeeId: string;
    jobType: string;
}) {
    const value = useMemo(() => ({ employeeId, jobType }), [employeeId, jobType]);
    return (
        <EmployeeContext.Provider value={value}>
            {children}
        </EmployeeContext.Provider>
    );
}

export function useEmployeeContext() {
    const ctx = useContext(EmployeeContext);
    if (!ctx) {
        throw new Error("useEmployeeContext must be used within EmployeeProvider");
    }
    return ctx;
}
