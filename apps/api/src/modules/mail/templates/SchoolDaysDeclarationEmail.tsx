import {
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';
import { getMailTranslations, type MailLocale } from '../mail-i18n';

interface SchoolDaysDeclarationEmailProps {
  adminName?: string;
  apprenticeName: string;
  month: string;
  dateCount: number;
  locale?: MailLocale;
}

export const SchoolDaysDeclarationEmail = ({
  adminName,
  apprenticeName,
  month,
  dateCount,
  locale = 'fr',
}: SchoolDaysDeclarationEmailProps) => {
  const t = getMailTranslations(locale);
  return (
    <EmailLayout
      previewText={locale === 'fr' ? `${apprenticeName} a déclaré ses jours d'école` : `${apprenticeName} declared school days`}
      tag={t.tags.notification}
      locale={locale}
    >
      <Heading style={h1}>{t.schoolDeclaration.heading}</Heading>
      <Text style={subjectText}>
        {t.schoolDeclaration.subject(month)}
      </Text>

      <Text style={text}>
        {t.common.hello}{adminName ? ` ${adminName}` : ''},
        <br /><br />
        <strong>{apprenticeName}</strong>{' '}
        {locale === 'fr'
          ? <>a déclaré ses jours d&apos;école pour le mois de{' '}<strong>{month}</strong>.</>
          : <>declared school days for <strong>{month}</strong>.</>
        }
      </Text>

      <Section style={infoBox}>
        <Text style={infoText}>
          {t.schoolDeclaration.dayCount(dateCount)}
        </Text>
      </Section>

      <Text style={disclaimer}>
        {t.schoolDeclaration.disclaimer}
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

const infoBox = {
  backgroundColor: '#F5F5F5',
  borderRadius: '16px',
  padding: '20px',
  textAlign: 'center' as const,
  margin: '0 0 24px',
};

const infoText = {
  color: '#171717',
  fontSize: '16px',
  fontWeight: '700',
  margin: '0',
};

const disclaimer = {
  color: '#A3A3A3',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
