"use client";

import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/app/login/_hooks/useAuth";
import { ArrowRight } from "lucide-react";
import { loginSchema } from "@pawly/validators";

type PasswordFormProps = {
    onSwitchToMagicLink: () => void;
};

export const PasswordForm = ({ onSwitchToMagicLink }: PasswordFormProps) => {
    const { login, isLoginPending } = useAuth();

    const form = useForm({
        defaultValues: {
            email: "",
            password: "",
        },
        onSubmit: async ({ value }) => {
            await login(value);
        },
    });

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
            className="space-y-5 pt-6"
        >
            <form.Field
                name="email"
                validators={{
                    onChange: ({ value }) => {
                        const result = loginSchema.shape.email.safeParse(value);
                        return result.success ? undefined : result.error.issues[0]?.message ?? "Email invalide";
                    },
                }}
            >
                {(field) => (
                    <div className="space-y-2">
                        <Label htmlFor={field.name} className="text-neutral-900 font-medium">Email</Label>
                        <Input
                            id={field.name}
                            type="email"
                            placeholder="admin@clinique.fr"
                            required
                            aria-invalid={field.state.meta.errors.length > 0}
                            aria-describedby={field.state.meta.errors.length > 0 ? `${field.name}-error` : undefined}
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            className="bg-neutral-50 border-neutral-200 focus:bg-white h-12 focus-visible:border-indigo-500 focus-visible:ring-indigo-500/20"
                        />
                        {field.state.meta.errors.length > 0 && (
                            <p id={`${field.name}-error`} className="text-[11px] text-orange-600" role="alert" aria-live="assertive">{field.state.meta.errors[0]}</p>
                        )}
                    </div>
                )}
            </form.Field>
            <form.Field
                name="password"
                validators={{
                    onChange: ({ value }) => {
                        const result = loginSchema.shape.password.safeParse(value);
                        return result.success ? undefined : result.error.issues[0]?.message ?? "Mot de passe requis";
                    },
                }}
            >
                {(field) => (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor={field.name} className="text-neutral-900 font-medium">Mot de passe</Label>
                            <button
                                type="button"
                                onClick={onSwitchToMagicLink}
                                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                            >
                                Oublié ?
                            </button>
                        </div>
                        <Input
                            id={field.name}
                            type="password"
                            required
                            aria-invalid={field.state.meta.errors.length > 0}
                            aria-describedby={field.state.meta.errors.length > 0 ? `${field.name}-error` : undefined}
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            className="bg-neutral-50 border-neutral-200 focus:bg-white h-12 focus-visible:border-indigo-500 focus-visible:ring-indigo-500/20"
                        />
                        {field.state.meta.errors.length > 0 && (
                            <p id={`${field.name}-error`} className="text-[11px] text-orange-600" role="alert" aria-live="assertive">{field.state.meta.errors[0]}</p>
                        )}
                    </div>
                )}
            </form.Field>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
                {([canSubmit, isSubmitting]) => (
                    <Button
                        type="submit"
                        className="w-full bg-neutral-900 hover:bg-black text-white font-bold h-12 shadow-lg shadow-neutral-900/10 transition-all hover:scale-[1.01]"
                        disabled={!canSubmit || isSubmitting || isLoginPending}
                    >
                        {isLoginPending ? "Connexion..." : <span className="flex items-center gap-2">Se connecter <ArrowRight className="w-4 h-4" /></span>}
                    </Button>
                )}
            </form.Subscribe>
        </form>
    );
};
