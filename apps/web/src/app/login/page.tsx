"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PawlyLogo } from "@/components/pawly-logo";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch("http://localhost:3001/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            if (!res.ok) {
                throw new Error("Login failed");
            }

            const data = await res.json();
            localStorage.setItem("token", data.access_token);
            localStorage.setItem("user", JSON.stringify(data.user));

            toast.success("Connexion réussie !");

            if (data.user.role === "ADMIN") {
                router.push("/admin/planning");
            } else {
                router.push("/my-planning");
            }
        } catch {
            toast.error("Email ou mot de passe incorrect");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#FDFDFD] relative overflow-hidden">

            {/* Background Ambient Layers */}
            <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] bg-[#009588]/5 blur-[120px] rounded-full mix-blend-multiply pointer-events-none"></div>
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-orange-500/5 blur-[120px] rounded-full mix-blend-multiply pointer-events-none"></div>

            <div className="w-full max-w-lg p-6 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="mb-10 text-center flex flex-col items-center">
                    <PawlyLogo className="scale-125 mb-6" iconClassName="w-16 h-16 shadow-2xl shadow-teal-900/20" />
                    <p className="text-neutral-500 text-lg">Le planning intelligent pour votre clinique.</p>
                </div>

                <Card className="shadow-[0_8px_30px_rgba(0,0,0,0.04)] border-neutral-100 bg-white/80 backdrop-blur-sm">
                    <CardHeader className="space-y-1 text-center pb-8">
                        <CardTitle className="text-2xl font-bold tracking-tight text-neutral-900">
                            Bienvenue
                        </CardTitle>
                        <CardDescription className="text-neutral-500">
                            Connectez-vous à votre espace personnel
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleLogin}>
                        <CardContent className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-neutral-900 font-medium">Email professionnel</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="nom@clinique.fr"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="bg-neutral-50 border-neutral-200 focus:bg-white h-11"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password" className="text-neutral-900 font-medium">Mot de passe</Label>
                                    <a href="#" className="text-xs text-[#009588] hover:text-[#00796B] font-medium transition-colors">
                                        Oublié ?
                                    </a>
                                </div>
                                <Input
                                    id="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="bg-neutral-50 border-neutral-200 focus:bg-white h-11"
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="pt-2">
                            <Button
                                type="submit"
                                className="w-full bg-neutral-900 hover:bg-black text-white font-bold h-12 shadow-lg shadow-neutral-900/10 transition-all hover:scale-[1.02]"
                                disabled={loading}
                            >
                                {loading ? "Connexion..." : <span className="flex items-center gap-2">Se connecter <ArrowRight className="w-4 h-4" /></span>}
                            </Button>
                        </CardFooter>
                        <div className="px-6 pb-6 pt-2">
                            <div className="flex items-center justify-center gap-2 text-[10px] text-neutral-400 font-mono uppercase tracking-widest">
                                <Check className="w-3 h-3 text-[#009588]" /> Connexion Sécurisée
                            </div>
                        </div>
                    </form>
                </Card>

                <div className="mt-8 text-center">
                    <p className="text-xs text-neutral-400">
                        © 2024 Pawly — v1.1 &quot;Clean Care&quot;
                    </p>
                </div>
            </div>
        </div>
    );
}
