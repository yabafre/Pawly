'use client';

import { useTranslations } from 'next-intl';
import { Building2, Clock, Layers, User } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClinicProfilePanel } from './ClinicProfilePanel';
import { ClinicOperationalConfigPanel } from './ClinicOperationalConfigPanel';
import { ShiftTypesPanel } from './ShiftTypesPanel';
import { AdminAccountPanel } from './AdminAccountPanel';

const triggerClass =
  'gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm';

export function SettingsTabs() {
  const t = useTranslations('settings');

  return (
    <Tabs defaultValue="account" className="space-y-6">
      <TabsList className="h-auto gap-1 rounded-2xl bg-muted p-1">
        <TabsTrigger value="account" className={triggerClass}>
          <User className="h-4 w-4" strokeWidth={1.5} />
          {t('tabs.account')}
        </TabsTrigger>
        <TabsTrigger value="clinic" className={triggerClass}>
          <Building2 className="h-4 w-4" strokeWidth={1.5} />
          {t('tabs.clinic')}
        </TabsTrigger>
        <TabsTrigger value="operational" className={triggerClass} data-tour="admin-clinic-hours">
          <Clock className="h-4 w-4" strokeWidth={1.5} />
          {t('tabs.operational')}
        </TabsTrigger>
        <TabsTrigger value="shiftTypes" className={triggerClass} data-tour="admin-shift-types">
          <Layers className="h-4 w-4" strokeWidth={1.5} />
          {t('tabs.shiftTypes')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="account">
        <AdminAccountPanel />
      </TabsContent>

      <TabsContent value="clinic">
        <ClinicProfilePanel />
      </TabsContent>

      <TabsContent value="operational">
        <ClinicOperationalConfigPanel />
      </TabsContent>

      <TabsContent value="shiftTypes">
        <ShiftTypesPanel />
      </TabsContent>
    </Tabs>
  );
}
