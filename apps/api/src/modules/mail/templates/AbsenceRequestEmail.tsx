import {
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';
import { getMailTranslations, type MailLocale } from '../mail-i18n';

interface AbsenceRequestEmailProps {
  adminName?: string;
  employeeName: string;
  absenceType: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  locale?: MailLocale;
}

export const AbsenceRequestEmail = ({
  adminName,
  employeeName,
  absenceType,
  startDate,
  endDate,
  dayCount,
  locale = 'fr',
}: AbsenceRequestEmailProps) => {
  const t = getMailTranslations(locale);
  return (
    <EmailLayout
      previewText={locale === 'fr' ? `${employeeName} a soumis une demande d'absence` : `${employeeName} submitted an absence request`}
      tag={t.tags.notification}
      locale={locale}
    >
      <Heading style={h1}>{t.absenceRequest.heading}</Heading>
      <Text style={subjectText}>
        {t.absenceRequest.subject}
      </Text>

      <Text style={text}>
        {t.common.hello}{adminName ? ` ${adminName}` : ''},
        <br /><br />
        <strong>{employeeName}</strong>{' '}
        {locale === 'fr'
          ? <>a soumis une demande d&apos;absence.</>
          : <>submitted an absence request.</>
        }
      </Text>

      <Section style={infoBox}>
        <Text style={infoText}>
          {t.absenceTypes[absenceType] ?? absenceType}
        </Text>
        <Text style={dateText}>
          {t.absenceRequest.dateRange(startDate, endDate, dayCount)}
        </Text>
      </Section>

      <Text style={text}>
        {t.absenceRequest.action}
      </Text>

      <Text style={disclaimer}>
        {t.absenceRequest.disclaimer}
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
  margin: '0 0 4px',
};

const dateText = {
  color: '#525252',
  fontSize: '14px',
  margin: '0',
};

const disclaimer = {
  color: '#A3A3A3',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
