import {
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';
import { getMailTranslations, type MailLocale } from '../mail-i18n';

interface OtpCodeEmailProps {
  code: string;
  locale?: MailLocale;
}

export const OtpCodeEmail = ({ code, locale = 'fr' }: OtpCodeEmailProps) => {
  const t = getMailTranslations(locale);
  return (
    <EmailLayout
      previewText={locale === 'fr' ? 'Votre code de connexion Pawly' : 'Your Pawly login code'}
      tag={t.tags.security}
      locale={locale}
    >
      <Heading style={h1}>{t.otp.heading}</Heading>
      <Text style={subjectText}>{t.otp.subject}</Text>

      <Text style={text}>
        {t.common.hello},
        <br /><br />
        {t.otp.body}
      </Text>

      <Section style={codeContainer}>
        <Text style={codeText}>{code.split('').join(' ')}</Text>
      </Section>

      <Text style={disclaimer}>
        {t.otp.disclaimer}
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

const codeContainer = {
  margin: '32px 0 24px',
  textAlign: 'center' as const,
  width: '100%',
  backgroundColor: '#F5F5F5',
  borderRadius: '16px',
  padding: '24px 0',
};

const codeText = {
  fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace',
  fontSize: '24px',
  fontWeight: '700',
  letterSpacing: '0.3em',
  color: '#171717',
  margin: '0',
};

const disclaimer = {
  color: '#A3A3A3',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
