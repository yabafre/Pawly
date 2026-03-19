import {
  Button,
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';
import { getMailTranslations, type MailLocale } from '../mail-i18n';

interface SchedulePublicationEmailProps {
  firstName: string;
  month: string;
  clinicName: string;
  dashboardUrl?: string;
  shiftCount?: number;
  locale?: MailLocale;
}

export const SchedulePublicationEmail = ({
  firstName,
  month,
  clinicName,
  dashboardUrl = '#',
  shiftCount,
  locale = 'fr',
}: SchedulePublicationEmailProps) => {
  const t = getMailTranslations(locale);
  return (
    <EmailLayout
      previewText={locale === 'fr' ? `Votre planning pour ${month} est publié` : `Your schedule for ${month} is published`}
      tag={t.tags.planning}
      locale={locale}
    >
      <Heading style={h1}>{t.schedulePublication.heading}</Heading>
      <Text style={subjectText}>
        {t.schedulePublication.subject(month)}
      </Text>

      <Text style={text}>
        {t.common.helloName(firstName)},
        <br /><br />
        {locale === 'fr' ? (
          <>
            Le planning pour <strong>{month}</strong> a été publié par{' '}
            <strong>{clinicName}</strong>.
            {shiftCount !== undefined && shiftCount > 0 && (
              <>
                {' '}Vous avez <strong>{shiftCount} créneau{shiftCount > 1 ? 'x' : ''}</strong> prévu{shiftCount > 1 ? 's' : ''} ce mois-ci.
              </>
            )}
            {' '}Vous pouvez dès maintenant consulter vos
            créneaux sur votre espace Pawly.
          </>
        ) : (
          <>
            The schedule for <strong>{month}</strong> has been published by{' '}
            <strong>{clinicName}</strong>.
            {shiftCount !== undefined && shiftCount > 0 && (
              <>
                {' '}You have <strong>{shiftCount} shift{shiftCount > 1 ? 's' : ''}</strong> scheduled this month.
              </>
            )}
            {' '}You can now view your shifts on your Pawly space.
          </>
        )}
      </Text>

      <Section style={buttonContainer}>
        <Button href={dashboardUrl} style={button}>
          {t.schedulePublication.button}
        </Button>
      </Section>

      <Text style={tipText}>
        {t.schedulePublication.tip}
      </Text>

      <Text style={disclaimer}>
        {t.schedulePublication.disclaimer}
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

const tipText = {
  color: '#009588',
  fontSize: '13px',
  textAlign: 'center' as const,
  marginTop: '16px',
  fontStyle: 'italic' as const,
};

const disclaimer = {
  color: '#A3A3A3',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
