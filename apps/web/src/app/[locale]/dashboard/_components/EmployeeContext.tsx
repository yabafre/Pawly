"use client";

import { createContext, useContext } from "react";

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
    return (
        <EmployeeContext.Provider value={{ employeeId, jobType }}>
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
