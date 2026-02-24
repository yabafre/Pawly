import {
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';

interface AbsenceReviewEmailProps {
  firstName: string;
  status: 'APPROVED' | 'REJECTED';
  absenceType: string;
  startDate: string;
  endDate: string;
  rejectionReason?: string;
}

const TYPE_LABELS: Record<string, string> = {
  PAID_LEAVE: 'Congé payé',
  SICK_LEAVE: 'Arrêt maladie',
  TRAINING: 'Formation',
  CHILD_SICK: 'Enfant malade',
  OTHER: 'Autre',
};

export const AbsenceReviewEmail = ({
  firstName,
  status,
  absenceType,
  startDate,
  endDate,
  rejectionReason,
}: AbsenceReviewEmailProps) => (
  <EmailLayout
    previewText={`Votre demande d'absence a été ${status === 'APPROVED' ? 'approuvée' : 'refusée'}`}
    tag="NOTIFICATION"
  >
    <Heading style={h1}>
      Demande d&apos;absence {status === 'APPROVED' ? 'approuvée' : 'refusée'}
    </Heading>

    <Text style={text}>
      Bonjour {firstName},
      <br /><br />
      Votre demande d&apos;absence a été{' '}
      <strong style={status === 'APPROVED' ? approvedStyle : rejectedStyle}>
        {status === 'APPROVED' ? 'approuvée' : 'refusée'}
      </strong>.
    </Text>

    <Section style={infoBox}>
      <Text style={infoText}>
        {TYPE_LABELS[absenceType] ?? absenceType}
      </Text>
      <Text style={dateText}>
        Du {startDate} au {endDate}
      </Text>
    </Section>

    {status === 'REJECTED' && rejectionReason && (
      <Section style={reasonBox}>
        <Text style={reasonLabel}>Motif du refus :</Text>
        <Text style={reasonText}>{rejectionReason}</Text>
      </Section>
    )}

    <Text style={disclaimer}>
      Cette notification est automatique. Consultez votre tableau de bord Pawly pour plus de détails.
    </Text>
  </EmailLayout>
);

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
