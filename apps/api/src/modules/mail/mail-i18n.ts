export type MailLocale = 'fr' | 'en';

type Translations = {
  // Layout
  layout: { unsubscribe: string; company: string };
  // Tags
  tags: {
    account: string;
    security: string;
    invitation: string;
    notification: string;
    reminder: string;
    planning: string;
  };
  // Subjects (used by mail.service.tsx)
  subjects: {
    magicLink: string;
    activation: string;
    welcome: string;
    planConfirmation: (plan: string) => string;
    invitation: (firstName: string) => string;
    otpCode: string;
    schoolDaysDeclaration: (name: string, month: string) => string;
    schoolDaysReminder: (month: string) => string;
    schedulePublication: (clinicName: string, month: string) => string;
    scheduleChanged: (clinicName: string, month: string) => string;
    absenceRequest: (employeeName: string) => string;
    absenceReview: (status: 'APPROVED' | 'REJECTED') => string;
    passwordReset: string;
  };
  // Absence type labels
  absenceTypes: Record<string, string>;
  // Common
  common: {
    hello: string;
    helloName: (name: string) => string;
    disclaimer: string;
    autoNotification: string;
  };
  // Per-template content
  magicLink: {
    heading: string;
    subject: string;
    body: string;
    button: string;
    disclaimer: string;
  };
  activation: {
    heading: string;
    subject: string;
    body: (name?: string) => string;
    button: string;
    disclaimer: string;
  };
  welcome: {
    heading: string;
    body: (name?: string) => string;
    button: string;
    footer: string;
  };
  planConfirmation: {
    heading: (plan: string) => string;
    body: (plan: string) => string;
    planLabel: string;
    planStarter: string;
    planPro: string;
    viewInvoice: string;
    button: string;
    footer: string;
  };
  invitation: {
    heading: string;
    subject: string;
    body: (firstName: string) => string;
    button: string;
    disclaimer: string;
  };
  otp: {
    heading: string;
    subject: string;
    body: string;
    disclaimer: string;
  };
  schoolDeclaration: {
    heading: string;
    subject: (month: string) => string;
    body: (
      adminName: string | undefined,
      apprenticeName: string,
      month: string,
    ) => string;
    dayCount: (count: number) => string;
    disclaimer: string;
  };
  schoolReminder: {
    heading: string;
    subject: (month: string) => string;
    body: (name: string, month: string) => string;
    button: string;
    disclaimer: string;
  };
  schedulePublication: {
    heading: string;
    subject: (month: string) => string;
    body: (
      firstName: string,
      month: string,
      clinicName: string,
      shiftCount?: number,
    ) => string;
    button: string;
    tip: string;
    disclaimer: string;
  };
  scheduleChanged: {
    heading: string;
    subject: (month: string) => string;
    button: string;
    disclaimer: string;
  };
  absenceRequest: {
    heading: string;
    subject: string;
    body: (adminName: string | undefined, employeeName: string) => string;
    action: string;
    disclaimer: string;
    dateRange: (start: string, end: string, days: number) => string;
  };
  absenceReview: {
    heading: (status: 'APPROVED' | 'REJECTED') => string;
    body: (firstName: string, status: 'APPROVED' | 'REJECTED') => string;
    reasonLabel: string;
    disclaimer: string;
    statusLabel: (s: 'APPROVED' | 'REJECTED') => string;
    dateRange: (start: string, end: string) => string;
  };
  passwordReset: {
    heading: string;
    subject: string;
    body: string;
    button: string;
    disclaimer: string;
    expiry: string;
  };
};

const fr: Translations = {
  layout: {
    unsubscribe: 'Se désinscrire',
    company: 'Pawly SAS • Paris, France',
  },
  tags: {
    account: 'COMPTE',
    security: 'SÉCURITÉ',
    invitation: 'INVITATION',
    notification: 'NOTIFICATION',
    reminder: 'RAPPEL',
    planning: 'PLANNING',
  },
  subjects: {
    magicLink: 'Your Magic Link for Pawly',
    activation: 'Complete your Pawly account setup',
    welcome: 'Bienvenue sur Pawly — votre clinique est prête !',
    planConfirmation: (plan) =>
      plan === 'professional'
        ? 'Votre abonnement Pro Pawly est actif'
        : 'Votre plan Starter Pawly est activé',
    invitation: (firstName) => `${firstName}, bienvenue dans l'équipe Pawly !`,
    otpCode: 'Votre code Pawly',
    schoolDaysDeclaration: (name, month) =>
      `${name} a déclaré ses jours d'école pour ${month}`,
    schoolDaysReminder: (month) =>
      `Rappel: déclarez vos jours d'école pour ${month}`,
    schedulePublication: (clinicName, month) =>
      `${clinicName} — Votre planning pour ${month} est publié`,
    scheduleChanged: (clinicName, month) =>
      `${clinicName} — Votre planning de ${month} a été modifié`,
    absenceRequest: (employeeName) =>
      `${employeeName} a soumis une demande d'absence`,
    absenceReview: (status) =>
      `Votre demande d'absence a été ${status === 'APPROVED' ? 'approuvée' : 'refusée'}`,
    passwordReset: 'Réinitialisation de votre mot de passe Pawly',
  },
  absenceTypes: {
    PAID_LEAVE: 'Congé payé',
    SICK_LEAVE: 'Arrêt maladie',
    TRAINING: 'Formation',
    CHILD_SICK: 'Enfant malade',
    OTHER: 'Autre',
  },
  common: {
    hello: 'Bonjour',
    helloName: (name) => `Bonjour ${name}`,
    disclaimer:
      'Cette notification est automatique. Consultez votre tableau de bord Pawly pour plus de détails.',
    autoNotification: 'Notification automatique',
  },
  magicLink: {
    heading: 'Connexion sécurisée.',
    subject: 'Objet: Votre lien magique de connexion',
    body: 'Vous avez demandé à vous connecter à votre espace Pawly. Cliquez sur le bouton ci-dessous pour accéder à votre compte en toute sécurité.',
    button: 'Se connecter maintenant',
    disclaimer:
      "Ce lien est valide pendant 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
  },
  activation: {
    heading: 'Votre clinique est prête.',
    subject: 'Objet: Bienvenue chez Pawly !',
    body: (name) =>
      `Bienvenue dans la famille Pawly ! Votre espace de travail est configuré et prêt à accueillir vos collaborateurs.\n\nVous pouvez dès maintenant définir votre mot de passe et activer votre compte.`,
    button: 'Activer mon compte',
    disclaimer:
      "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
  },
  welcome: {
    heading: 'Bienvenue sur Pawly !',
    body: (name) =>
      `${name ? `${name}, votre` : 'Votre'} clinique est configurée et prête à accueillir votre équipe. Vous pouvez dès maintenant ajouter vos collaborateurs, configurer vos plannings et gérer vos absences.`,
    button: 'Accéder à mon tableau de bord',
    footer: 'Si vous avez des questions, répondez directement à cet email.',
  },
  planConfirmation: {
    heading: (plan) =>
      plan === 'professional'
        ? 'Votre abonnement Pro est actif !'
        : 'Votre plan Starter est activé !',
    body: (plan) =>
      plan === 'professional'
        ? 'Merci pour votre confiance ! Votre abonnement Professionnel est maintenant actif. Vous avez accès à toutes les fonctionnalités de Pawly.'
        : 'Votre plan Starter est activé. Vous pouvez commencer à utiliser Pawly dès maintenant. Passez au plan Professionnel à tout moment pour débloquer toutes les fonctionnalités.',
    planLabel: 'Votre plan',
    planStarter: 'Starter — Gratuit',
    planPro: 'Professionnel — 29,99 €/mois',
    viewInvoice: 'Voir ma facture',
    button: 'Accéder à mon tableau de bord',
    footer: 'Si vous avez des questions, répondez directement à cet email.',
  },
  invitation: {
    heading: "Bienvenue dans l'équipe !",
    subject: 'Objet: Invitation à rejoindre Pawly',
    body: (firstName) =>
      `Votre responsable vous a ajouté(e) à l'équipe sur Pawly. Cliquez sur le bouton ci-dessous pour accéder à votre espace personnel. Ce lien est valable 24 heures.`,
    button: 'Accéder à mon espace',
    disclaimer:
      "Lors de vos prochaines connexions, demandez un lien magique depuis la page de connexion.\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
  },
  otp: {
    heading: 'Votre code de connexion',
    subject: 'Objet: Code de vérification Pawly',
    body: "Entrez ce code dans l'application pour vous connecter :",
    disclaimer:
      "Ce code est valide pendant 5 minutes. Si vous n'avez pas demandé ce code, ignorez cet email.",
  },
  schoolDeclaration: {
    heading: "Déclaration de jours d'école",
    subject: (month) => `Objet: Nouvelle déclaration pour ${month}`,
    body: (adminName, apprenticeName, month) =>
      `${adminName ? ` ${adminName}` : ''}\n\n**${apprenticeName}** a déclaré ses jours d'école pour le mois de **${month}**.`,
    dayCount: (count) =>
      `${count} jour${count > 1 ? 's' : ''} d'école déclaré${count > 1 ? 's' : ''}`,
    disclaimer:
      'Cette notification est automatique. Consultez votre tableau de bord Pawly pour plus de détails.',
  },
  schoolReminder: {
    heading: 'Rappel de déclaration',
    subject: (month) => `Objet: Déclarez vos jours d'école pour ${month}`,
    body: (name, month) =>
      `Vous n'avez pas encore déclaré vos jours d'école pour le mois de **${month}**. Veuillez effectuer votre déclaration avant la fin du mois.`,
    button: "Déclarer mes jours d'école",
    disclaimer: 'Ce rappel est envoyé automatiquement le 25 de chaque mois.',
  },
  schedulePublication: {
    heading: 'Planning publié',
    subject: (month) => `Objet: Votre planning pour ${month} est disponible`,
    body: (firstName, month, clinicName, shiftCount) => {
      let text = `Le planning pour **${month}** a été publié par **${clinicName}**.`;
      if (shiftCount !== undefined && shiftCount > 0) {
        text += ` Vous avez **${shiftCount} créneau${shiftCount > 1 ? 'x' : ''}** prévu${shiftCount > 1 ? 's' : ''} ce mois-ci.`;
      }
      text +=
        ' Vous pouvez dès maintenant consulter vos créneaux sur votre espace Pawly.';
      return text;
    },
    button: 'Consulter mon planning',
    tip: "Astuce : Installez Pawly sur votre écran d'accueil pour un accès instantané !",
    disclaimer:
      'Ce message est envoyé automatiquement lors de la publication du planning.',
  },
  scheduleChanged: {
    heading: 'Planning modifié',
    subject: (month) => `Modification de votre planning de ${month}`,
    button: 'Voir mon planning',
    disclaimer:
      'Vous recevez cet email car un créneau de votre planning publié a été modifié.',
  },
  absenceRequest: {
    heading: "Nouvelle demande d'absence",
    subject: 'Objet: Demande à valider',
    body: (adminName, employeeName) =>
      `${adminName ? ` ${adminName}` : ''}\n\n**${employeeName}** a soumis une demande d'absence.`,
    action:
      'Connectez-vous à votre tableau de bord Pawly pour approuver ou refuser cette demande.',
    disclaimer:
      'Cette notification est automatique. Consultez votre tableau de bord Pawly pour plus de détails.',
    dateRange: (start, end, days) =>
      `Du ${start} au ${end} · ${days} jour${days > 1 ? 's' : ''}`,
  },
  absenceReview: {
    heading: (status) =>
      `Demande d'absence ${status === 'APPROVED' ? 'approuvée' : 'refusée'}`,
    body: (firstName, status) =>
      `Votre demande d'absence a été **${status === 'APPROVED' ? 'approuvée' : 'refusée'}**.`,
    reasonLabel: 'Motif du refus :',
    disclaimer:
      'Cette notification est automatique. Consultez votre tableau de bord Pawly pour plus de détails.',
    statusLabel: (s) => (s === 'APPROVED' ? 'approuvée' : 'refusée'),
    dateRange: (start, end) => `Du ${start} au ${end}`,
  },
  passwordReset: {
    heading: 'Réinitialisation du mot de passe',
    subject: 'Réinitialisation de votre mot de passe Pawly',
    body: 'Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.',
    button: 'Réinitialiser mon mot de passe',
    disclaimer:
      "Si vous n'avez pas demandé cette réinitialisation, ignorez simplement cet email. Votre mot de passe restera inchangé.",
    expiry: 'Ce lien expire dans 1 heure.',
  },
};

const en: Translations = {
  layout: {
    unsubscribe: 'Unsubscribe',
    company: 'Pawly SAS • Paris, France',
  },
  tags: {
    account: 'ACCOUNT',
    security: 'SECURITY',
    invitation: 'INVITATION',
    notification: 'NOTIFICATION',
    reminder: 'REMINDER',
    planning: 'PLANNING',
  },
  subjects: {
    magicLink: 'Your Magic Link for Pawly',
    activation: 'Complete your Pawly account setup',
    welcome: 'Welcome to Pawly — your clinic is ready!',
    planConfirmation: (plan) =>
      plan === 'professional'
        ? 'Your Pawly Pro subscription is active'
        : 'Your Pawly Starter plan is activated',
    invitation: (firstName) => `${firstName}, welcome to the Pawly team!`,
    otpCode: 'Your Pawly code',
    schoolDaysDeclaration: (name, month) =>
      `${name} declared school days for ${month}`,
    schoolDaysReminder: (month) =>
      `Reminder: declare your school days for ${month}`,
    schedulePublication: (clinicName, month) =>
      `${clinicName} — Your schedule for ${month} is published`,
    scheduleChanged: (clinicName, month) =>
      `${clinicName} — Your ${month} schedule was updated`,
    absenceRequest: (employeeName) =>
      `${employeeName} submitted an absence request`,
    absenceReview: (status) =>
      `Your absence request has been ${status === 'APPROVED' ? 'approved' : 'rejected'}`,
    passwordReset: 'Reset your Pawly password',
  },
  absenceTypes: {
    PAID_LEAVE: 'Paid leave',
    SICK_LEAVE: 'Sick leave',
    TRAINING: 'Training',
    CHILD_SICK: 'Child sick leave',
    OTHER: 'Other',
  },
  common: {
    hello: 'Hello',
    helloName: (name) => `Hello ${name}`,
    disclaimer:
      'This is an automatic notification. Check your Pawly dashboard for more details.',
    autoNotification: 'Automatic notification',
  },
  magicLink: {
    heading: 'Secure login.',
    subject: 'Subject: Your magic login link',
    body: 'You requested to log in to your Pawly account. Click the button below to access your account securely.',
    button: 'Log in now',
    disclaimer:
      'This link is valid for 15 minutes. If you did not request this, please ignore this email.',
  },
  activation: {
    heading: 'Your clinic is ready.',
    subject: 'Subject: Welcome to Pawly!',
    body: (name) =>
      `Welcome to the Pawly family! Your workspace is configured and ready for your team.\n\nYou can now set your password and activate your account.`,
    button: 'Activate my account',
    disclaimer: 'If you did not request this, please ignore this email.',
  },
  welcome: {
    heading: 'Welcome to Pawly!',
    body: (name) =>
      `${name ? `${name}, your` : 'Your'} clinic is set up and ready for your team. You can now add team members, configure schedules, and manage absences.`,
    button: 'Go to my dashboard',
    footer: 'If you have any questions, reply directly to this email.',
  },
  planConfirmation: {
    heading: (plan) =>
      plan === 'professional'
        ? 'Your Pro subscription is active!'
        : 'Your Starter plan is activated!',
    body: (plan) =>
      plan === 'professional'
        ? 'Thank you for your trust! Your Professional subscription is now active. You have access to all Pawly features.'
        : 'Your Starter plan is activated. You can start using Pawly right away. Upgrade to Professional anytime to unlock all features.',
    planLabel: 'Your plan',
    planStarter: 'Starter — Free',
    planPro: 'Professional — €29.99/month',
    viewInvoice: 'View my invoice',
    button: 'Go to my dashboard',
    footer: 'If you have any questions, reply directly to this email.',
  },
  invitation: {
    heading: 'Welcome to the team!',
    subject: 'Subject: Invitation to join Pawly',
    body: (firstName) =>
      `Your manager has added you to the team on Pawly. Click the button below to access your personal space. This link is valid for 24 hours.`,
    button: 'Access my space',
    disclaimer:
      'For future logins, request a magic link from the login page.\nIf you did not request this, please ignore this email.',
  },
  otp: {
    heading: 'Your login code',
    subject: 'Subject: Pawly verification code',
    body: 'Enter this code in the app to log in:',
    disclaimer:
      'This code is valid for 5 minutes. If you did not request this code, please ignore this email.',
  },
  schoolDeclaration: {
    heading: 'School days declaration',
    subject: (month) => `Subject: New declaration for ${month}`,
    body: (adminName, apprenticeName, month) =>
      `${adminName ? ` ${adminName}` : ''}\n\n**${apprenticeName}** declared school days for **${month}**.`,
    dayCount: (count) => `${count} school day${count > 1 ? 's' : ''} declared`,
    disclaimer:
      'This is an automatic notification. Check your Pawly dashboard for more details.',
  },
  schoolReminder: {
    heading: 'Declaration reminder',
    subject: (month) => `Subject: Declare your school days for ${month}`,
    body: (name, month) =>
      `You have not yet declared your school days for **${month}**. Please submit your declaration before the end of the month.`,
    button: 'Declare my school days',
    disclaimer:
      'This reminder is sent automatically on the 25th of each month.',
  },
  schedulePublication: {
    heading: 'Schedule published',
    subject: (month) => `Subject: Your schedule for ${month} is available`,
    body: (firstName, month, clinicName, shiftCount) => {
      let text = `The schedule for **${month}** has been published by **${clinicName}**.`;
      if (shiftCount !== undefined && shiftCount > 0) {
        text += ` You have **${shiftCount} shift${shiftCount > 1 ? 's' : ''}** scheduled this month.`;
      }
      text += ' You can now view your shifts on your Pawly space.';
      return text;
    },
    button: 'View my schedule',
    tip: 'Tip: Install Pawly on your home screen for instant access!',
    disclaimer:
      'This message is sent automatically when the schedule is published.',
  },
  scheduleChanged: {
    heading: 'Schedule updated',
    subject: (month) => `Your ${month} schedule was updated`,
    button: 'View my schedule',
    disclaimer:
      'You are receiving this email because a shift on your published schedule was changed.',
  },
  absenceRequest: {
    heading: 'New absence request',
    subject: 'Subject: Request to validate',
    body: (adminName, employeeName) =>
      `${adminName ? ` ${adminName}` : ''}\n\n**${employeeName}** submitted an absence request.`,
    action: 'Log in to your Pawly dashboard to approve or reject this request.',
    disclaimer:
      'This is an automatic notification. Check your Pawly dashboard for more details.',
    dateRange: (start, end, days) =>
      `From ${start} to ${end} · ${days} day${days > 1 ? 's' : ''}`,
  },
  absenceReview: {
    heading: (status) =>
      `Absence request ${status === 'APPROVED' ? 'approved' : 'rejected'}`,
    body: (firstName, status) =>
      `Your absence request has been **${status === 'APPROVED' ? 'approved' : 'rejected'}**.`,
    reasonLabel: 'Reason for rejection:',
    disclaimer:
      'This is an automatic notification. Check your Pawly dashboard for more details.',
    statusLabel: (s) => (s === 'APPROVED' ? 'approved' : 'rejected'),
    dateRange: (start, end) => `From ${start} to ${end}`,
  },
  passwordReset: {
    heading: 'Password Reset',
    subject: 'Reset your Pawly password',
    body: 'You requested a password reset. Click the button below to choose a new password.',
    button: 'Reset my password',
    disclaimer:
      'If you did not request this reset, simply ignore this email. Your password will remain unchanged.',
    expiry: 'This link expires in 1 hour.',
  },
};

const translations: Record<MailLocale, Translations> = { fr, en };

export function getMailTranslations(locale: MailLocale): Translations {
  return translations[locale] ?? translations.fr;
}

export function formatDateForLocale(date: Date, locale: MailLocale): string {
  const loc = locale === 'fr' ? 'fr-FR' : 'en-GB';
  return date.toLocaleDateString(loc, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
