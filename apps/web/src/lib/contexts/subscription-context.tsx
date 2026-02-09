"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { ACTIVE_SUBSCRIPTION_STATUSES, TIER_HIERARCHY } from "@pawly/validators";

interface SubscriptionContextValue {
  status: string | null;
  entitlementTier: string;
  isActive: boolean;
  canAccessFeature: (requiredTier: string) => boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  status: null,
  entitlementTier: "starter",
  isActive: false,
  canAccessFeature: () => false,
});

interface SubscriptionProviderProps {
  status: string | null;
  entitlementTier: string;
  children: ReactNode;
}

export function SubscriptionProvider({
  status,
  entitlementTier,
  children,
}: SubscriptionProviderProps) {
  const isActive = (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status ?? "");

  const canAccessFeature = (requiredTier: string): boolean => {
    if (!isActive) return false;
    const currentIndex = TIER_HIERARCHY.indexOf(
      entitlementTier as (typeof TIER_HIERARCHY)[number],
    );
    const requiredIndex = TIER_HIERARCHY.indexOf(
      requiredTier as (typeof TIER_HIERARCHY)[number],
    );
    if (currentIndex === -1 || requiredIndex === -1) return false;
    return currentIndex >= requiredIndex;
  };

  return (
    <SubscriptionContext.Provider
      value={{ status, entitlementTier, isActive, canAccessFeature }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
