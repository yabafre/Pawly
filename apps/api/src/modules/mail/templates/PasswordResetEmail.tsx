import {
  Button,
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';
import { getMailTranslations, type MailLocale } from '../mail-i18n';

interface PasswordResetEmailProps {
  url: string;
  locale?: MailLocale;
}

export const PasswordResetEmail = ({ url, locale = 'fr' }: PasswordResetEmailProps) => {
  const t = getMailTranslations(locale);
  return (
    <EmailLayout previewText={t.passwordReset.subject} tag={t.tags.security} locale={locale}>
      <Heading style={h1}>{t.passwordReset.heading}</Heading>
      <Text style={subjectText}>{t.passwordReset.subject}</Text>

      <Text style={text}>
        {t.common.hello},
        <br /><br />
        {t.passwordReset.body}
      </Text>

      <Section style={buttonContainer}>
        <Button href={url} style={button}>
          {t.passwordReset.button}
        </Button>
      </Section>

      <Text style={expiryText}>
        {t.passwordReset.expiry}
      </Text>

      <Text style={disclaimer}>
        {t.passwordReset.disclaimer}
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

const expiryText = {
  color: '#737373',
  fontSize: '13px',
  textAlign: 'center' as const,
  margin: '0 0 16px',
};

const disclaimer = {
  color: '#A3A3A3',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '8px',
};
