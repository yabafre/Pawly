import {
  Button,
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';

interface SchedulePublicationEmailProps {
  firstName: string;
  month: string;
  clinicName: string;
  dashboardUrl?: string;
  shiftCount?: number;
}

export const SchedulePublicationEmail = ({
  firstName,
  month,
  clinicName,
  dashboardUrl = '#',
  shiftCount,
}: SchedulePublicationEmailProps) => (
  <EmailLayout previewText={`Votre planning pour ${month} est publié`} tag="PLANNING">
    <Heading style={h1}>Planning publié</Heading>
    <Text style={subjectText}>
      Objet: Votre planning pour {month} est disponible
    </Text>

    <Text style={text}>
      Bonjour {firstName},
      <br /><br />
      Le planning pour <strong>{month}</strong> a été publié par{' '}
      <strong>{clinicName}</strong>.
      {shiftCount !== undefined && shiftCount > 0 && (
        <>
          {' '}Vous avez <strong>{shiftCount} créneau{shiftCount > 1 ? 'x' : ''}</strong> prévu{shiftCount > 1 ? 's' : ''} ce mois-ci.
        </>
      )}
      {' '}Vous pouvez dès maintenant consulter vos
      créneaux sur votre espace Pawly.
    </Text>

    <Section style={buttonContainer}>
      <Button href={dashboardUrl} style={button}>
        Consulter mon planning
      </Button>
    </Section>

    <Text style={tipText}>
      Astuce : Installez Pawly sur votre écran d&apos;accueil pour un accès instantané !
    </Text>

    <Text style={disclaimer}>
      Ce message est envoyé automatiquement lors de la publication du planning.
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

const tipText = {
  color: '#009588',
  fontSize: '13px',
  textAlign: 'center' as const,
  marginTop: '16px',
  fontStyle: 'italic' as const,
};

const disclaimer = {
  color: '#A3A3A3',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
