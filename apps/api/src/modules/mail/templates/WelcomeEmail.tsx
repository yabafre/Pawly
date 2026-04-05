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

interface WelcomeEmailProps {
  url: string;
  adminName?: string;
  locale?: MailLocale;
}

export const WelcomeEmail = ({ url, adminName, locale = 'fr' }: WelcomeEmailProps) => {
  const t = getMailTranslations(locale);
  const greeting = adminName
    ? t.common.helloName(adminName)
    : t.common.hello;

  return (
    <EmailLayout
      previewText={locale === 'fr' ? 'Bienvenue sur Pawly !' : 'Welcome to Pawly!'}
      tag={t.tags.account}
      locale={locale}
    >
      <Heading style={h1}>{t.welcome.heading}</Heading>

      <Text style={text}>
        {greeting},
        <br /><br />
        {t.welcome.body(adminName)}
      </Text>

      <Section style={buttonContainer}>
        <Button href={url} style={button}>
          {t.welcome.button}
        </Button>
      </Section>

      <Hr style={hr} />

      <Text style={footer}>
        {t.welcome.footer}
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

const buttonContainer = {
  margin: '0 0 24px',
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
