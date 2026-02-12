import {
  Button,
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';

interface SchoolDaysReminderEmailProps {
  name: string;
  month: string;
  dashboardUrl?: string;
}

export const SchoolDaysReminderEmail = ({
  name,
  month,
  dashboardUrl = '#',
}: SchoolDaysReminderEmailProps) => (
  <EmailLayout previewText="Rappel: déclarez vos jours d'école" tag="RAPPEL">
    <Heading style={h1}>Rappel de déclaration</Heading>
    <Text style={subjectText}>
      Objet: Déclarez vos jours d'école pour {month}
    </Text>

    <Text style={text}>
      Bonjour {name},
      <br /><br />
      Vous n'avez pas encore déclaré vos jours d'école pour le mois de{' '}
      <strong>{month}</strong>. Veuillez effectuer votre déclaration avant la fin du mois.
    </Text>

    <Section style={buttonContainer}>
      <Button href={dashboardUrl} style={button}>
        Déclarer mes jours d'école
      </Button>
    </Section>

    <Text style={disclaimer}>
      Ce rappel est envoyé automatiquement le 25 de chaque mois.
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

const disclaimer = {
  color: '#A3A3A3',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
