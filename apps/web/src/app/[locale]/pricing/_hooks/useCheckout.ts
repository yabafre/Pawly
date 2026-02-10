"use client";

import { useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { createCheckoutSessionAction } from "../_actions/checkout-actions";

export const useCheckout = () => {
  const { mutate, isPending, error } = useServerActionMutation(
    createCheckoutSessionAction,
    { actionKeyFactory: () => ["checkout"] }
  );
  return { checkout: mutate, isPending, error };
};
