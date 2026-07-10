'use client';

import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { Bell, BellRing, Smartphone, LogOut, ArrowLeft, HelpCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { isStandalone } from '@/lib/pwa-utils';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Link, useRouter } from '@/i18n/navigation';
import { logoutAction } from '@/app/[locale]/(auth)/login/_actions/auth-actions';
import { useReplayTour } from '@/lib/tours/useTour';
import { useQueryClient } from '@tanstack/react-query';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../_hooks/useNotificationPreferences';
import { usePushNotifications } from '../_hooks/usePushNotifications';
import { useHydrated } from '@/lib/hooks';

const subscribe = () => () => {};
const getSnapshot = () => isStandalone();
const getServerSnapshot = () => false;

export function SettingsPageClient() {
  const t = useTranslations('dashboard.settings');
  const tCommon = useTranslations('common');
  const tTour = useTranslations('tour');
  const router = useRouter();
  const queryClient = useQueryClient();
  const replayTour = useReplayTour();
  const hydrated = useHydrated();
  const { data: preferences, isPending } = useNotificationPreferences();
  const { mutate: updatePreferences, isPending: isUpdating } = useUpdateNotificationPreferences();
  const {
    permissionState,
    isSubscribed: pushSubscribed,
    isStale: pushStale,
    isLoading: pushLoading,
    subscribe: subscribePush,
    unsubscribe: unsubscribePush,
  } = usePushNotifications();
  const pwaInstalled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // !hydrated: mirror the server render (no data → default true, switch
  // disabled) on the first client render even if the persisted query cache
  // already restored preferences, otherwise hydration mismatches.
  const notifyOnPublish = hydrated ? (preferences?.notifyOnPublish ?? true) : true;

  const handleToggleNotify = (checked: boolean) => {
    updatePreferences({ notifyOnPublish: checked });
  };

  const handleReplayTour = () => {
    replayTour('EMPLOYEE');
    router.push('/dashboard');
  };

  const handleLogout = async () => {
    queryClient.clear();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE');
    }
    await logoutAction();
    router.push('/login');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="w-8 h-8 flex items-center justify-center rounded-full border bg-card hover:bg-muted transition shrink-0"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t('title')}</h1>
      </div>

      {/* Language */}
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{tCommon('language.label')}</span>
          <LanguageSwitcher />
        </div>
      </div>

      {/* App status */}
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <Smartphone size={18} strokeWidth={1.5} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t('appSection')}</h2>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t('pwaStatus')}</span>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full border ${pwaInstalled ? 'text-primary bg-primary/5' : 'text-muted-foreground'}`}
          >
            {pwaInstalled ? t('installed') : t('notInstalled')}
          </span>
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Bell size={18} strokeWidth={1.5} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t('notificationsSection')}</h2>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0 mr-4">
            <label htmlFor="notify-on-publish" className="text-sm font-medium cursor-pointer">
              {t('notifyOnPublish')}
            </label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('notifyOnPublishDescription')}
            </p>
          </div>
          <Switch
            id="notify-on-publish"
            checked={notifyOnPublish}
            onCheckedChange={handleToggleNotify}
            disabled={!hydrated || isPending || isUpdating}
          />
        </div>

        {permissionState !== 'unsupported' && (
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex-1 min-w-0 mr-4">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{t('pushNotifications')}</span>
                {pushSubscribed && <BellRing className="h-3.5 w-3.5 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t('pushDescription')}</p>
              {permissionState === 'denied' && (
                <p className="text-xs text-destructive mt-1">{t('pushDenied')}</p>
              )}
              {pushStale && <p className="text-xs text-amber-600 mt-1">{t('pushStale')}</p>}
            </div>
            {pushSubscribed ? (
              <Button variant="outline" size="sm" onClick={unsubscribePush} disabled={pushLoading}>
                {t('pushDisable')}
              </Button>
            ) : pushStale ? (
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={unsubscribePush}
                  disabled={pushLoading}
                >
                  {t('pushDisable')}
                </Button>
                <Button size="sm" onClick={subscribePush} disabled={pushLoading}>
                  {t('pushReactivate')}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={subscribePush}
                disabled={pushLoading || permissionState === 'denied'}
              >
                {t('pushEnable')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Replay guided tour */}
      <Button
        variant="outline"
        onClick={handleReplayTour}
        className="w-full gap-2 text-muted-foreground"
      >
        <HelpCircle size={16} />
        {tTour('replayGuide')}
      </Button>

      {/* Logout */}
      <Button
        variant="outline"
        onClick={handleLogout}
        className="w-full gap-2 text-muted-foreground"
      >
        <LogOut size={16} />
        {tCommon('logout')}
      </Button>
    </div>
  );
}
