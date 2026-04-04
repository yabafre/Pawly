"use client";

import { useServerActionMutation } from "zsa-react-query";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { registerAction } from "../_actions/register-actions";

export function useRegister() {
  const router = useRouter();
  const locale = useLocale();

  const { mutate: register, isPending } = useServerActionMutation(registerAction, {
    onSuccess: () => {
      router.push(`/${locale}/admin/onboarding`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Registration failed";
      toast.error(message);
    },
  });

  return { register, isPending };
}
