import {
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';

interface SchoolDaysDeclarationEmailProps {
  adminName?: string;
  apprenticeName: string;
  month: string;
  dateCount: number;
}

export const SchoolDaysDeclarationEmail = ({
  adminName,
  apprenticeName,
  month,
  dateCount,
}: SchoolDaysDeclarationEmailProps) => (
  <EmailLayout previewText={`${apprenticeName} a déclaré ses jours d'école`} tag="NOTIFICATION">
    <Heading style={h1}>Déclaration de jours d'école</Heading>
    <Text style={subjectText}>
      Objet: Nouvelle déclaration pour {month}
    </Text>

    <Text style={text}>
      Bonjour{adminName ? ` ${adminName}` : ''},
      <br /><br />
      <strong>{apprenticeName}</strong> a déclaré ses jours d'école pour le mois de{' '}
      <strong>{month}</strong>.
    </Text>

    <Section style={infoBox}>
      <Text style={infoText}>
        {dateCount} jour{dateCount > 1 ? 's' : ''} d'école déclaré{dateCount > 1 ? 's' : ''}
      </Text>
    </Section>

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
  margin: '0',
};

const disclaimer = {
  color: '#A3A3A3',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
