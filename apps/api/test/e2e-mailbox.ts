import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * A mail this run would have handed to Resend. `url` and `code` are lifted out
 * of the per-template arguments because those are the only two things a browser
 * test can act on: a link to follow, or a code to type.
 */
export interface CapturedMail {
  type: string;
  to: string;
  url?: string;
  code?: string;
  args: unknown[];
  sentAt: string;
}

/**
 * File-backed rather than in-memory: the API under test is a separate process
 * from the Playwright runner, so the mailbox has to survive a process boundary.
 */
export class E2eMailbox {
  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.reset();
  }

  reset(): void {
    writeFileSync(this.path, '[]', 'utf8');
  }

  read(): CapturedMail[] {
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as CapturedMail[];
    } catch {
      return [];
    }
  }

  record(mail: CapturedMail): void {
    const all = this.read();
    all.push(mail);
    writeFileSync(this.path, JSON.stringify(all, null, 2), 'utf8');
  }
}

/**
 * Stands in for MailService. Every method resolves the way the real one does on
 * success, so the code under test follows its happy path — the difference is
 * only that the message lands in a file instead of Resend.
 *
 * Methods are generated from a table rather than written out: the point of the
 * stub is capture, and a per-method body would be thirteen copies of one line.
 */
const MAIL_METHODS: Record<
  string,
  { url?: number; code?: number; returns?: unknown; returnsRecipientCount?: boolean }
> = {
  sendMagicLink: { url: 1 },
  sendActivationEmail: { url: 1 },
  sendWelcomeEmail: {},
  sendPlanConfirmationEmail: {},
  sendEmployeeInvitationEmail: { url: 1 },
  sendSchoolDaysNotification: {},
  sendSchedulePublicationEmail: { returns: true },
  sendScheduleChangedEmail: { returns: true },
  // The real method answers with the number of recipients it managed to
  // notify; returning `true` here made every caller log a partial-failure
  // error (`1 < emails.length`) on a send that actually succeeded.
  sendBatchSchedulePublicationEmails: { returnsRecipientCount: true },
  sendSchoolDaysReminder: {},
  sendOtpCode: { code: 1 },
  sendAbsenceRequestNotification: {},
  sendAbsenceReviewNotification: {},
  sendPasswordResetEmail: { url: 1 },
};

export function createMailServiceStub(mailbox: E2eMailbox): Record<string, unknown> {
  const stub: Record<string, unknown> = {};

  for (const [method, spec] of Object.entries(MAIL_METHODS)) {
    stub[method] = async (...args: unknown[]) => {
      mailbox.record({
        type: method,
        to: typeof args[0] === 'string' ? args[0] : '(batch)',
        url: spec.url !== undefined ? (args[spec.url] as string) : undefined,
        code: spec.code !== undefined ? (args[spec.code] as string) : undefined,
        args,
        sentAt: new Date().toISOString(),
      });
      if (spec.returnsRecipientCount) {
        return Array.isArray(args[0]) ? args[0].length : 0;
      }
      return spec.returns;
    };
  }

  // Used by the invitation path to decide whether to dispatch through
  // Trigger.dev; false keeps everything on the direct path this stub captures.
  stub.triggerSendEmail = async () => false;

  return stub;
}
