import { Loader2 } from "lucide-react";

export default function OnboardingLoading() {
  return (
    <div className="min-h-screen bg-background py-12 px-6">
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    </div>
  );
}
