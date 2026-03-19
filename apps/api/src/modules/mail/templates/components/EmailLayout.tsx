import {
    Body,
    Container,
    Head,
    Html,
    Preview,
    Section,
    Text,
    Font,
    Row,
    Column,
    Link,
    Img,
} from '@react-email/components';
import * as React from 'react';
import { getMailTranslations, type MailLocale } from '../../mail-i18n';

interface EmailLayoutProps {
    children: React.ReactNode;
    previewText: string;
    tag?: string; // e.g. "COMPTE", "NOTIFICATION"
    locale?: MailLocale;
}

export const EmailLayout = ({ children, previewText, tag = 'COMPTE', locale = 'fr' }: EmailLayoutProps) => {
    const t = getMailTranslations(locale);
    return (
        <Html>
            <Head>
                <Font
                    fontFamily="Inter"
                    fallbackFontFamily="sans-serif"
                    webFont={{
                        url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEkVIdt.woff2',
                        format: 'woff2',
                    }}
                    fontWeight={400}
                    fontStyle="normal"
                />
                <Font
                    fontFamily="Inter"
                    fallbackFontFamily="sans-serif"
                    webFont={{
                        url: 'https://fonts.gstatic.com/s/inter/v13/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEkVIdt.woff2',
                        format: 'woff2',
                    }}
                    fontWeight={700}
                    fontStyle="normal"
                />
            </Head>
            <Preview>{previewText}</Preview>
            <Body style={main}>
                <Container style={containerWrapper}>
                    {/* Card Container */}
                    <Section style={card}>
                        {/* Header */}
                        <Section style={header}>
                            <Row>
                                <Column align="left">
                                    <div style={logoContainer}>
                                        <div style={logoIcon}>
                                            {/* Visual approximation of Paw icon using emoji or shape since we lack asset URL */}
                                            <Text style={{ margin: 0, fontSize: '16px', lineHeight: '16px' }}>🐾</Text>
                                        </div>
                                        <Text style={logoText}>Pawly</Text>
                                    </div>
                                </Column>
                                <Column align="right">
                                    <Text style={headerTag}>{tag}</Text>
                                </Column>
                            </Row>
                        </Section>

                        {/* Gradient Divider - Fallback for email clients */}
                        <Section style={dividerWrapper}>
                            <div style={divider} />
                        </Section>

                        {/* Content Area */}
                        <Section style={content}>
                            {children}
                        </Section>

                        {/* Footer */}
                        <Section style={footer}>
                            <Row style={{ marginBottom: '16px' }}>
                                <Column align="center">
                                    <div style={socialContainer}>
                                        {/* Social Icon Placeholders - In / Tw */}
                                        <div style={socialIcon}>
                                            <Text style={socialText}>In</Text>
                                        </div>
                                        <span style={{ display: 'inline-block', width: '12px' }}></span>
                                        <div style={socialIcon}>
                                            <Text style={socialText}>Tw</Text>
                                        </div>
                                    </div>
                                </Column>
                            </Row>
                            <Text style={footerText}>
                                {t.layout.company}
                            </Text>
                            <Link href="#" style={unsubscribeLink}>
                                {t.layout.unsubscribe}
                            </Link>
                        </Section>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
};

// --- STYLES "Modern Clinical" v1.3 ---

const main = {
    backgroundColor: '#F5F5F5', // Neutral 100/200 mix for outer background
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '40px 20px',
};

const containerWrapper = {
    margin: '0 auto',
    maxWidth: '480px', // max-w-md
};

const card = {
    backgroundColor: '#FFFFFF',
    borderRadius: '24px', // rounded-3xl
    border: '1px solid #E5E5E5', // border-neutral-100
    overflow: 'hidden' as const,
    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
};

const header = {
    padding: '32px 32px 16px',
};

const logoContainer = {
    display: 'flex',
    alignItems: 'center',
};

const logoIcon = {
    width: '32px',
    height: '32px',
    backgroundColor: '#E6F4F3', // Lightest teal/neutral mix approximation for #009588/10
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '8px',
    float: 'left' as const,
};

const logoText = {
    fontSize: '18px',
    lineHeight: '32px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: '#171717', // Ink Black
    margin: 0,
    float: 'left' as const,
};

const headerTag = {
    fontSize: '10px',
    fontWeight: 700,
    color: '#D4D4D4', // neutral-300
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em', // tracking-widest
    margin: 0,
};

const dividerWrapper = {
    padding: '0',
    width: '100%',
};

const divider = {
    height: '1px',
    width: '100%',
    backgroundColor: '#F0F0F0', // Slight visible divider
};

const content = {
    padding: '32px',
};

const footer = {
    backgroundColor: '#FAFAFA',
    padding: '24px',
    textAlign: 'center' as const,
    borderTop: '1px solid #E5E5E5',
};

const socialContainer = {
    display: 'inline-block',
    textAlign: 'center' as const,
};

const socialIcon = {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#FFFFFF',
    border: '1px solid #E5E5E5',
    display: 'inline-block',
    textAlign: 'center' as const,
    verticalAlign: 'middle',
    lineHeight: '32px',
};

const socialText = {
    fontSize: '10px',
    fontWeight: 700,
    color: '#A3A3A3',
    margin: 0,
    lineHeight: '32px',
};

const footerText = {
    fontSize: '10px',
    color: '#A3A3A3', // neutral-400
    margin: '0 0 4px',
};

const unsubscribeLink = {
    fontSize: '10px',
    color: '#A3A3A3',
    textDecoration: 'underline',
};
