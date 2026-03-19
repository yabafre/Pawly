import {
  Button,
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';
import { getMailTranslations, type MailLocale } from '../mail-i18n';

interface SchoolDaysReminderEmailProps {
  name: string;
  month: string;
  dashboardUrl?: string;
  locale?: MailLocale;
}

export const SchoolDaysReminderEmail = ({
  name,
  month,
  dashboardUrl = '#',
  locale = 'fr',
}: SchoolDaysReminderEmailProps) => {
  const t = getMailTranslations(locale);
  return (
    <EmailLayout
      previewText={locale === 'fr' ? "Rappel: déclarez vos jours d'école" : 'Reminder: declare your school days'}
      tag={t.tags.reminder}
      locale={locale}
    >
      <Heading style={h1}>{t.schoolReminder.heading}</Heading>
      <Text style={subjectText}>
        {t.schoolReminder.subject(month)}
      </Text>

      <Text style={text}>
        {t.common.helloName(name)},
        <br /><br />
        {locale === 'fr'
          ? <>Vous n&apos;avez pas encore déclaré vos jours d&apos;école pour le mois de{' '}<strong>{month}</strong>. Veuillez effectuer votre déclaration avant la fin du mois.</>
          : <>You have not yet declared your school days for <strong>{month}</strong>. Please submit your declaration before the end of the month.</>
        }
      </Text>

      <Section style={buttonContainer}>
        <Button href={dashboardUrl} style={button}>
          {t.schoolReminder.button}
        </Button>
      </Section>

      <Text style={disclaimer}>
        {t.schoolReminder.disclaimer}
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

const disclaimer = {
  color: '#A3A3A3',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
