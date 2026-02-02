"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Wand2 } from "lucide-react";
import { format, startOfWeek, addDays, subWeeks, addWeeks, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Mock Data
const EMPLOYEES = [
    { id: 1, name: "Camille", role: "ASV 1", color: "bg-blue-100 text-blue-700" },
    { id: 2, name: "Eva", role: "ASV 2", color: "bg-purple-100 text-purple-700" },
    { id: 3, name: "Emma", role: "ASV 1", color: "bg-green-100 text-green-700" },
    { id: 4, name: "Dr Hallier", role: "Véto", color: "bg-orange-100 text-orange-700" },
];

export default function PlanningPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));

    const handleGenerate = () => {
        toast.promise(
            new Promise((resolve) => setTimeout(resolve, 1500)),
            {
                loading: 'Génération du planning en cours...',
                success: 'Planning généré avec succès !',
                error: 'Erreur lors de la génération',
            }
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Planning</h1>
                    <p className="text-gray-500">Gestion des horaires et équipes</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => setCurrentDate(subWeeks(currentDate, 1))}>
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <div className="font-medium w-40 text-center">
                        {format(startDate, "d MMMM", { locale: fr })} - {format(addDays(startDate, 6), "d MMMM", { locale: fr })}
                    </div>
                    <Button variant="outline" size="icon" onClick={() => setCurrentDate(addWeeks(currentDate, 1))}>
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button onClick={handleGenerate} className="bg-teal-600 hover:bg-teal-700 text-white ml-2">
                        <Wand2 className="w-4 h-4 mr-2" />
                        Générer
                    </Button>
                </div>
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-700 font-semibold border-b">
                            <tr>
                                <th className="px-4 py-3 min-w-[150px]">Employé</th>
                                {weekDays.map((day) => (
                                    <th key={day.toString()} className={cn("px-4 py-3 min-w-[120px]", isSameDay(day, new Date()) && "bg-teal-50 text-teal-700")}>
                                        <div className="capitalize">{format(day, "EEEE", { locale: fr })}</div>
                                        <div className="text-xs font-normal text-gray-500">{format(day, "d MMM", { locale: fr })}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y text-gray-600">
                            {EMPLOYEES.map((employee) => (
                                <tr key={employee.id} className="hover:bg-gray-50/50">
                                    <td className="px-4 py-4 font-medium text-gray-900 bg-white sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                        <div>{employee.name}</div>
                                        <div className="text-xs text-gray-400">{employee.role}</div>
                                    </td>
                                    {weekDays.map((day) => (
                                        <td key={day.toString()} className="px-4 py-3 border-l first:border-l-0">
                                            {/* Placeholder Logic for Shifts */}
                                            {Math.random() > 0.3 ? (
                                                <div className={cn("rounded-md p-2 text-xs font-medium border", employee.color)}>
                                                    08:30 - 18:30
                                                </div>
                                            ) : (
                                                <div className="text-center text-gray-300">-</div>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-blue-50/50 border-blue-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-700">Heures planifiées</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-900">140 h</div>
                        <p className="text-xs text-blue-600">Objectif: 140h (100%)</p>
                    </CardContent>
                </Card>
                <Card className="bg-yellow-50/50 border-yellow-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-yellow-700">Conflits potentiels</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-yellow-900">2</div>
                        <p className="text-xs text-yellow-600">Mardi : 1 seul véto</p>
                    </CardContent>
                </Card>
                <Card className="bg-green-50/50 border-green-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-green-700">Absences</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-900">1</div>
                        <p className="text-xs text-green-600">Eva (Formation)</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
