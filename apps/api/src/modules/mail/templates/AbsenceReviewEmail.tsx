import {
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';
import { getMailTranslations, type MailLocale } from '../mail-i18n';

interface AbsenceReviewEmailProps {
  firstName: string;
  status: 'APPROVED' | 'REJECTED';
  absenceType: string;
  startDate: string;
  endDate: string;
  rejectionReason?: string;
  locale?: MailLocale;
}

export const AbsenceReviewEmail = ({
  firstName,
  status,
  absenceType,
  startDate,
  endDate,
  rejectionReason,
  locale = 'fr',
}: AbsenceReviewEmailProps) => {
  const t = getMailTranslations(locale);
  return (
    <EmailLayout
      previewText={locale === 'fr'
        ? `Votre demande d'absence a été ${status === 'APPROVED' ? 'approuvée' : 'refusée'}`
        : `Your absence request has been ${status === 'APPROVED' ? 'approved' : 'rejected'}`
      }
      tag={t.tags.notification}
      locale={locale}
    >
      <Heading style={h1}>
        {t.absenceReview.heading(status)}
      </Heading>

      <Text style={text}>
        {t.common.helloName(firstName)},
        <br /><br />
        {locale === 'fr' ? (
          <>
            Votre demande d&apos;absence a été{' '}
            <strong style={status === 'APPROVED' ? approvedStyle : rejectedStyle}>
              {t.absenceReview.statusLabel(status)}
            </strong>.
          </>
        ) : (
          <>
            Your absence request has been{' '}
            <strong style={status === 'APPROVED' ? approvedStyle : rejectedStyle}>
              {t.absenceReview.statusLabel(status)}
            </strong>.
          </>
        )}
      </Text>

      <Section style={infoBox}>
        <Text style={infoText}>
          {t.absenceTypes[absenceType] ?? absenceType}
        </Text>
        <Text style={dateText}>
          {t.absenceReview.dateRange(startDate, endDate)}
        </Text>
      </Section>

      {status === 'REJECTED' && rejectionReason && (
        <Section style={reasonBox}>
          <Text style={reasonLabel}>{t.absenceReview.reasonLabel}</Text>
          <Text style={reasonText}>{rejectionReason}</Text>
        </Section>
      )}

      <Text style={disclaimer}>
        {t.absenceReview.disclaimer}
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

const text = {
  color: '#525252',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '0 0 32px',
};

const approvedStyle = {
  color: '#10B981',
};

const rejectedStyle = {
  color: '#F43F5E',
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

const reasonBox = {
  backgroundColor: '#FFF1F2',
  borderRadius: '16px',
  padding: '16px 20px',
  margin: '0 0 24px',
};

const reasonLabel = {
  color: '#F43F5E',
  fontSize: '13px',
  fontWeight: '600',
  margin: '0 0 4px',
};

const reasonText = {
  color: '#525252',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
};

const disclaimer = {
  color: '#A3A3A3',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
