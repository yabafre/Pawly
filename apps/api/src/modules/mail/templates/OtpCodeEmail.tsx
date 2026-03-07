import {
  Heading,
  Text,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './components/EmailLayout';

interface OtpCodeEmailProps {
  code: string;
}

export const OtpCodeEmail = ({ code }: OtpCodeEmailProps) => (
  <EmailLayout previewText="Votre code de connexion Pawly" tag="SÉCURITÉ">
    <Heading style={h1}>Votre code de connexion</Heading>
    <Text style={subjectText}>Objet: Code de vérification Pawly</Text>

    <Text style={text}>
      Bonjour,
      <br /><br />
      Entrez ce code dans l&apos;application pour vous connecter :
    </Text>

    <Section style={codeContainer}>
      <Text style={codeText}>{code.split('').join(' ')}</Text>
    </Section>

    <Text style={disclaimer}>
      Ce code est valide pendant 5 minutes. Si vous n&apos;avez pas demandé ce code, ignorez cet email.
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

const codeContainer = {
  margin: '32px 0 24px',
  textAlign: 'center' as const,
  width: '100%',
  backgroundColor: '#F5F5F5',
  borderRadius: '16px',
  padding: '24px 0',
};

const codeText = {
  fontFamily: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace',
  fontSize: '24px',
  fontWeight: '700',
  letterSpacing: '0.3em',
  color: '#171717',
  margin: '0',
};

const disclaimer = {
  color: '#A3A3A3',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
