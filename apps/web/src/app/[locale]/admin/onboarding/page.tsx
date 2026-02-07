import { setRequestLocale } from "next-intl/server";
import { OnboardingWizard } from "./_components/OnboardingWizard";
import { getOnboardingStatusAction } from "./_actions/onboarding-actions";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function OnboardingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Fetch initial data server-side for pre-filling the wizard
  let initialData = {
    clinicName: "",
    config: null as {
      workDays: string[];
      defaultStartTime: string;
      defaultEndTime: string;
    } | null,
    shiftTypes: [] as Array<{
      name: string;
      code: string;
      startTime: string;
      endTime: string;
      color: string;
    }>,
  };

  try {
    const [status, actionErr] = await getOnboardingStatusAction();
    if (!actionErr) {
      initialData = {
        clinicName: status.clinicName,
        config: status.config
          ? {
              workDays: status.config.workDays,
              defaultStartTime: status.config.defaultStartTime,
              defaultEndTime: status.config.defaultEndTime,
            }
          : null,
        shiftTypes: status.shiftTypes.map((st) => ({
          name: st.name,
          code: st.code,
          startTime: st.startTime,
          endTime: st.endTime,
          color: st.color,
        })),
      };
    }
  } catch {
    // If fetching fails, proceed with empty defaults
  }

  return <OnboardingWizard initialData={initialData} />;
}
