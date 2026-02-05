"use client";

import { useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PawlyLogo } from "@/components/pawly-logo";
import { Check, Mail, Lock } from "lucide-react";
import { MagicLinkForm } from "./MagicLinkForm";
import { PasswordForm } from "./PasswordForm";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";

export const LoginPageClient = () => {
    const [activeTab, setActiveTab] = useState("magic");
    const t = useTranslations("auth.login");
    const tCommon = useTranslations("common");
    const tBrand = useTranslations("brand");

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#FDFDFD] relative overflow-hidden">
            {/* Language Switcher - Top Right */}
            <div className="absolute top-4 right-4 z-20">
                <LanguageSwitcher />
            </div>

            {/* Background Ambient Layers */}
            <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] bg-indigo-500/5 blur-[120px] rounded-full mix-blend-multiply pointer-events-none"></div>
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-orange-500/5 blur-[120px] rounded-full mix-blend-multiply pointer-events-none"></div>

            <div className="w-full max-w-lg p-6 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="mb-10 text-center flex flex-col items-center">
                    <PawlyLogo className="scale-125 mb-6" iconClassName="w-16 h-16 shadow-2xl shadow-neutral-900/20" />
                    <p className="text-neutral-500 text-lg font-medium">{t("tagline")}</p>
                </div>

                <Card className="rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border-neutral-100 bg-white/90 backdrop-blur-sm overflow-hidden">
                    <CardHeader className="space-y-1 text-center pb-6">
                        <CardTitle className="text-2xl font-bold tracking-tight text-neutral-900">
                            {t("title")}
                        </CardTitle>
                        <CardDescription className="text-neutral-500">
                            {t("subtitle")}
                        </CardDescription>
                    </CardHeader>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <div className="px-6">
                            <TabsList className="grid w-full grid-cols-2 bg-neutral-100 p-1 h-12 rounded-full">
                                <TabsTrigger value="magic" className="rounded-full data-[state=active]:bg-neutral-900 data-[state=active]:text-white data-[state=active]:shadow-md">
                                    <Mail className="w-4 h-4 mr-2" /> {t("magicLinkTab")}
                                </TabsTrigger>
                                <TabsTrigger value="password" className="rounded-full data-[state=active]:bg-neutral-900 data-[state=active]:text-white data-[state=active]:shadow-md">
                                    <Lock className="w-4 h-4 mr-2" /> {t("passwordTab")}
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="magic" className="animate-in fade-in-50 duration-500">
                            <div className="px-6 pb-6">
                                <MagicLinkForm />
                            </div>
                        </TabsContent>

                        <TabsContent value="password" className="animate-in fade-in-50 duration-500">
                            <div className="px-6 pb-6">
                                <PasswordForm onSwitchToMagicLink={() => setActiveTab("magic")} />
                            </div>
                        </TabsContent>
                    </Tabs>

                    <div className="px-6 pb-6 pt-2">
                        <div className="flex items-center justify-center gap-2 text-[10px] text-neutral-400 font-mono uppercase tracking-widest border-t border-neutral-50 pt-6">
                            <div className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-indigo-600" /> {tCommon("sslConnection")}
                            </div>
                            <span className="opacity-20">|</span>
                            <div className="flex items-center gap-1.5">
                                <Lock className="w-3 h-3 text-neutral-300" /> {tCommon("multiTenant")}
                            </div>
                        </div>
                    </div>
                </Card>

                <div className="mt-8 text-center space-y-4">
                    <p className="text-xs text-neutral-400 font-medium uppercase tracking-widest">
                        {tBrand("copyright")}
                    </p>
                </div>
            </div>
        </div>
    );
};
