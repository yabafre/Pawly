import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface ActivationEmailProps {
  url: string;
  adminName?: string;
}

export const ActivationEmail = ({ url, adminName }: ActivationEmailProps) => (
  <Html>
    <Head />
    <Preview>Complete your Pawly account setup</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Welcome to Pawly{adminName ? `, ${adminName}` : ''}!</Heading>
        <Text style={text}>
          Your clinic subscription has been created. To get started, please set
          your password by clicking the link below.
        </Text>
        <Link href={url} style={link}>
          👉 Set my password and activate my account 👈
        </Link>
        <Text style={footer}>
          This link will expire in 24 hours and can only be used once.
          After setting your password, you can log in using your email and password.
        </Text>
      </Container>
    </Body>
  </Html>
);

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
  width: '580px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  padding: '17px 0 0',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
};

const link = {
  color: '#2754C5',
  fontSize: '16px',
  textDecoration: 'underline',
};

const footer = {
  color: '#898989',
  fontSize: '14px',
  lineHeight: '24px',
  marginTop: '20px',
};
