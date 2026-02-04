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

interface MagicLinkEmailProps {
  url: string;
}

export const MagicLinkEmail = ({ url }: MagicLinkEmailProps) => (
  <Html>
    <Head />
    <Preview>Your magic link for Pawly</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Login to Pawly</Heading>
        <Text style={text}>
          Click the link below to securely sign in to your Pawly account.
        </Text>
        <Link href={url} style={link}>
          👉 Click here to sign in 👈
        </Link>
        <Text style={footer}>
          This link will expire in 15 minutes and can only be used once.
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
