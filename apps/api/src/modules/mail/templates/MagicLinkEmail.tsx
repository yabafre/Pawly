import {
  Button,
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';

interface MagicLinkEmailProps {
  url: string;
}

export const MagicLinkEmail = ({ url }: MagicLinkEmailProps) => (
  <EmailLayout previewText="Connexion à Pawly" tag="SÉCURITÉ">
    <Heading style={h1}>Connexion sécurisée.</Heading>
    <Text style={subjectText}>Objet: Votre lien magique de connexion</Text>

    <Text style={text}>
      Bonjour,
      <br /><br />
      Vous avez demandé à vous connecter à votre espace Pawly. Cliquez sur le bouton ci-dessous pour accéder à votre compte en toute sécurité.
    </Text>

    <Section style={buttonContainer}>
      <Button href={url} style={button}>
        Se connecter maintenant
      </Button>
    </Section>

    <Text style={disclaimer}>
      Ce lien est valide pendant 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
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
  color: '#A3A3A3', // Neutral 400
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
