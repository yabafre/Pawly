import {
  Button,
  Heading,
  Text,
  Section,
  Hr,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';
import { getMailTranslations, type MailLocale } from '../mail-i18n';

interface PlanConfirmationEmailProps {
  plan: 'starter' | 'professional';
  adminName?: string;
  dashboardUrl: string;
  invoiceUrl?: string;
  locale?: MailLocale;
}

export const PlanConfirmationEmail = ({
  plan,
  adminName,
  dashboardUrl,
  invoiceUrl,
  locale = 'fr',
}: PlanConfirmationEmailProps) => {
  const t = getMailTranslations(locale);
  const greeting = adminName
    ? t.common.helloName(adminName)
    : t.common.hello;

  const isPro = plan === 'professional';

  return (
    <EmailLayout
      previewText={isPro
        ? (locale === 'fr' ? 'Votre abonnement Pro est actif' : 'Your Pro subscription is active')
        : (locale === 'fr' ? 'Votre plan Starter est activé' : 'Your Starter plan is activated')
      }
      tag={t.tags.account}
      locale={locale}
    >
      <Heading style={h1}>{t.planConfirmation.heading(plan)}</Heading>

      <Text style={text}>
        {greeting},
        <br /><br />
        {t.planConfirmation.body(plan)}
      </Text>

      <Section style={planCard}>
        <Text style={planLabel}>{t.planConfirmation.planLabel}</Text>
        <Text style={planValue}>
          {isPro ? t.planConfirmation.planPro : t.planConfirmation.planStarter}
        </Text>
      </Section>

      {isPro && invoiceUrl && (
        <Section style={buttonContainer}>
          <Button href={invoiceUrl} style={outlineButton}>
            {t.planConfirmation.viewInvoice}
          </Button>
        </Section>
      )}

      <Section style={buttonContainer}>
        <Button href={dashboardUrl} style={button}>
          {t.planConfirmation.button}
        </Button>
      </Section>

      <Hr style={hr} />

      <Text style={footer}>
        {t.planConfirmation.footer}
      </Text>
    </EmailLayout>
  );
};

const h1 = {
  color: '#171717',
  fontSize: '24px',
  fontWeight: '700',
  lineHeight: '32px',
  letterSpacing: '-0.02em',
  margin: '0 0 24px',
};

const text = {
  color: '#525252',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '0 0 24px',
};

const planCard = {
  backgroundColor: '#F3F1EE',
  borderRadius: '12px',
  padding: '16px 20px',
  margin: '0 0 24px',
};

const planLabel = {
  color: '#6B6B6B',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  margin: '0 0 4px',
};

const planValue = {
  color: '#171717',
  fontSize: '16px',
  fontWeight: '700',
  margin: '0',
};

const buttonContainer = {
  margin: '0 0 12px',
  textAlign: 'center' as const,
  width: '100%',
};

const button = {
  backgroundColor: '#009588',
  borderRadius: '12px',
  color: '#FFFFFF',
  fontSize: '15px',
  fontWeight: '700',
  textDecoration: 'none',
  padding: '14px 0',
  display: 'block',
  width: '100%',
  textAlign: 'center' as const,
};

const outlineButton = {
  backgroundColor: 'transparent',
  borderRadius: '12px',
  border: '2px solid #E8E5E0',
  color: '#171717',
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'none',
  padding: '12px 0',
  display: 'block',
  width: '100%',
  textAlign: 'center' as const,
};

const hr = {
  borderColor: '#E8E5E0',
  margin: '24px 0',
};

const footer = {
  color: '#A3A3A3',
  fontSize: '13px',
  textAlign: 'center' as const,
  margin: '0',
};
