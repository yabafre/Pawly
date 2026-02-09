import {
  Button,
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';

interface ActivationEmailProps {
  url: string;
  adminName?: string;
}

export const ActivationEmail = ({ url, adminName }: ActivationEmailProps) => (
  <EmailLayout previewText="Bienvenue chez Pawly !" tag="COMPTE">
    <Heading style={h1}>Votre clinique est prête.</Heading>
    <Text style={subjectText}>Objet: Bienvenue chez Pawly !</Text>

    <Text style={text}>
      Bonjour {adminName ? adminName : 'Docteur'},
      <br /><br />
      Bienvenue dans la famille Pawly ! Votre espace de travail est configuré et prêt à accueillir vos collaborateurs.
      <br /><br />
      Vous pouvez dès maintenant définir votre mot de passe et activer votre compte.
    </Text>

    <Section style={buttonContainer}>
      <Button href={url} style={button}>
        Activer mon compte
      </Button>
    </Section>

    <Text style={disclaimer}>
      Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
    </Text>
  </EmailLayout>
);

const h1 = {
  color: '#171717', // Ink Black
  fontSize: '24px',
  fontWeight: '700',
  lineHeight: '32px',
  letterSpacing: '-0.02em',
  margin: '0 0 8px',
};

const subjectText = {
  color: '#A3A3A3', // Neutral 400/500
  fontSize: '14px',
  fontWeight: '500',
  margin: '0 0 24px',
};

const text = {
  color: '#525252', // Neutral 600
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
  backgroundColor: '#171717', // Ink Black
  borderRadius: '16px', // rounded-2xl
  color: '#FFFFFF',
  fontSize: '15px',
  fontWeight: '700',
  textDecoration: 'none',
  padding: '16px 0', // py-4
  display: 'block', // w-full
  width: '100%',
  textAlign: 'center' as const,
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
};

const disclaimer = {
  color: '#A3A3A3', // neutral-400
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
