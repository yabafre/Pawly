import {
  Button,
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';
import { getMailTranslations, type MailLocale } from '../mail-i18n';

interface ActivationEmailProps {
  url: string;
  adminName?: string;
  locale?: MailLocale;
}

export const ActivationEmail = ({ url, adminName, locale = 'fr' }: ActivationEmailProps) => {
  const t = getMailTranslations(locale);
  const greeting = adminName
    ? t.common.helloName(adminName)
    : locale === 'fr' ? 'Bonjour Docteur' : 'Hello Doctor';
  return (
    <EmailLayout previewText={locale === 'fr' ? 'Bienvenue chez Pawly !' : 'Welcome to Pawly!'} tag={t.tags.account} locale={locale}>
      <Heading style={h1}>{t.activation.heading}</Heading>
      <Text style={subjectText}>{t.activation.subject}</Text>

      <Text style={text}>
        {greeting},
        <br /><br />
        {t.activation.body(adminName)}
      </Text>

      <Section style={buttonContainer}>
        <Button href={url} style={button}>
          {t.activation.button}
        </Button>
      </Section>

      <Text style={disclaimer}>
        {t.activation.disclaimer}
      </Text>
    </EmailLayout>
  );
};

const h1 = {
  color: '#171717', // Ink Black
  fontSize: '24px',
  fontWeight: '700',
  lineHeight: '32px',
  letterSpacing: '-0.02em',
  margin: '0 0 8px',
};

const subjectText = {
  color: '#A3A3A3', // Neutral 400/500
  fontSize: '14px',
  fontWeight: '500',
  margin: '0 0 24px',
};

const text = {
  color: '#525252', // Neutral 600
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
  backgroundColor: '#171717', // Ink Black
  borderRadius: '16px', // rounded-2xl
  color: '#FFFFFF',
  fontSize: '15px',
  fontWeight: '700',
  textDecoration: 'none',
  padding: '16px 0', // py-4
  display: 'block', // w-full
  width: '100%',
  textAlign: 'center' as const,
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
};

const disclaimer = {
  color: '#A3A3A3', // neutral-400
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
