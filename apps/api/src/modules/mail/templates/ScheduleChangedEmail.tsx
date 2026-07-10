import { Button, Heading, Text, Section } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';
import { getMailTranslations, type MailLocale } from '../mail-i18n';

interface ScheduleChangedEmailProps {
  firstName: string;
  month: string;
  clinicName: string;
  dashboardUrl?: string;
  locale?: MailLocale;
}

export const ScheduleChangedEmail = ({
  firstName,
  month,
  clinicName,
  dashboardUrl = '#',
  locale = 'fr',
}: ScheduleChangedEmailProps) => {
  const t = getMailTranslations(locale);
  return (
    <EmailLayout
      previewText={
        locale === 'fr'
          ? `Votre planning de ${month} a été modifié`
          : `Your ${month} schedule was updated`
      }
      tag={t.tags.planning}
      locale={locale}
    >
      <Heading style={h1}>{t.scheduleChanged.heading}</Heading>
      <Text style={subjectText}>{t.scheduleChanged.subject(month)}</Text>

      <Text style={text}>
        {t.common.helloName(firstName)},
        <br />
        <br />
        {locale === 'fr' ? (
          <>
            Le planning publié de <strong>{month}</strong> a été modifié par{' '}
            <strong>{clinicName}</strong> et un de vos créneaux est concerné.
            Merci de vérifier vos horaires à jour sur votre espace Pawly.
          </>
        ) : (
          <>
            The published schedule for <strong>{month}</strong> was updated by{' '}
            <strong>{clinicName}</strong> and one of your shifts is affected.
            Please check your up-to-date hours on your Pawly space.
          </>
        )}
      </Text>

      <Section style={buttonContainer}>
        <Button href={dashboardUrl} style={button}>
          {t.scheduleChanged.button}
        </Button>
      </Section>

      <Text style={disclaimer}>{t.scheduleChanged.disclaimer}</Text>
    </EmailLayout>
  );
};

const h1 = {
  color: '#171717',
  fontSize: '24px',
  fontWeight: '700',
  lineHeight: '32px',
  letterSpacing: '-0.02em',
  margin: '0 0 8px',
};

const subjectText = {
  color: '#A3A3A3',
  fontSize: '14px',
  fontWeight: '500',
  margin: '0 0 24px',
};

const text = {
  color: '#525252',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '0 0 32px',
};

const buttonContainer = {
  margin: '32px 0 24px',
  textAlign: 'center' as const,
  width: '100%',
};

const button = {
  backgroundColor: '#171717',
  borderRadius: '16px',
  color: '#FFFFFF',
  fontSize: '15px',
  fontWeight: '700',
  textDecoration: 'none',
  padding: '16px 0',
  display: 'block',
  width: '100%',
  textAlign: 'center' as const,
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
};

const disclaimer = {
  color: '#A3A3A3',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
