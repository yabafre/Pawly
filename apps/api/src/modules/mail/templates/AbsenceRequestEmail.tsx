import {
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';

interface AbsenceRequestEmailProps {
  adminName?: string;
  employeeName: string;
  absenceType: string;
  startDate: string;
  endDate: string;
  dayCount: number;
}

const TYPE_LABELS: Record<string, string> = {
  PAID_LEAVE: 'Congé payé',
  SICK_LEAVE: 'Arrêt maladie',
  TRAINING: 'Formation',
  CHILD_SICK: 'Enfant malade',
  OTHER: 'Autre',
};

export const AbsenceRequestEmail = ({
  adminName,
  employeeName,
  absenceType,
  startDate,
  endDate,
  dayCount,
}: AbsenceRequestEmailProps) => (
  <EmailLayout previewText={`${employeeName} a soumis une demande d'absence`} tag="NOTIFICATION">
    <Heading style={h1}>Nouvelle demande d&apos;absence</Heading>
    <Text style={subjectText}>
      Objet: Demande à valider
    </Text>

    <Text style={text}>
      Bonjour{adminName ? ` ${adminName}` : ''},
      <br /><br />
      <strong>{employeeName}</strong> a soumis une demande d&apos;absence.
    </Text>

    <Section style={infoBox}>
      <Text style={infoText}>
        {TYPE_LABELS[absenceType] ?? absenceType}
      </Text>
      <Text style={dateText}>
        Du {startDate} au {endDate} · {dayCount} jour{dayCount > 1 ? 's' : ''}
      </Text>
    </Section>

    <Text style={text}>
      Connectez-vous à votre tableau de bord Pawly pour approuver ou refuser cette demande.
    </Text>

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
