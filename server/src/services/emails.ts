// Resale email templates.
//
// Each function below builds one of the transactional emails the resale system
// sends and funnels it through the single `sendEmail` seam. Automatic emails are
// fired from the action that triggers them (registration, publish, decline,
// handover completion, waiting-list promotion); the pickup-date email is the one
// manual/admin-composed message, sent on demand from the resale window.
//
// Keeping every template here means copy lives in one place and call sites stay
// thin — only real delivery (SMTP / Graph / Power Automate) needs wiring later,
// inside `sendEmail`.

import { config } from '../config';
import { sendEmail } from './email';

function link(path: string): string {
  return `${config.appUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  // Entra sends the name claim as "Surname, Given" — use the given name.
  const given = trimmed.includes(',') ? trimmed.split(',')[1]?.trim() || '' : trimmed;
  return (given || trimmed).split(/\s+/)[0] || fullName;
}

function signOff(): string {
  return ['', 'Thank you,', 'The Laptop Resale team'].join('\n');
}

// Employee-facing name for the program (replaces internal resale titles in copy).
const PROGRAM_NAME = 'Computer Purchase Program';

// 1a. Registration received (auto, on submit).
export async function sendRegistrationConfirmationEmail(params: {
  to: string;
  fullName: string;
  resaleTitle: string;
  modelNames: string[];
}): Promise<void> {
  const { to, fullName, modelNames } = params;
  const choice =
    modelNames.length > 1
      ? `Your selected laptops (in order of preference):\n${modelNames.map((m, i) => `  ${i + 1}. ${m}`).join('\n')}`
      : `Your selected laptop: ${modelNames[0] ?? '(not specified)'}`;
  await sendEmail({
    to,
    subject: `Registration confirmed — ${PROGRAM_NAME}`,
    body: [
      `Hi ${firstName(fullName)},`,
      '',
      `Your registration for the ${PROGRAM_NAME} has been received.`,
      '',
      choice,
      '',
      `You can review or change your registration here: ${link('/my-registrations')}`,
      `We'll email you again once the results are published.`,
      signOff(),
    ].join('\n'),
  });
}

// 1b. Registration cancelled (auto, on cancel).
export async function sendRegistrationCancellationEmail(params: {
  to: string;
  fullName: string;
  resaleTitle: string;
  byAdmin: boolean;
  adminName?: string | null;
  reason?: string | null;
  reregisterUntil?: string | null;
}): Promise<void> {
  const { to, fullName, byAdmin, adminName, reason, reregisterUntil } = params;
  const lines = [`Hi ${firstName(fullName)},`, ''];
  if (byAdmin) {
    lines.push(
      `Your registration for the ${PROGRAM_NAME} has been cancelled by ${adminName || 'an administrator'}.`,
      '',
      `Reason: ${reason?.trim() || '(no reason provided)'}`
    );
  } else {
    lines.push(`Your registration for the ${PROGRAM_NAME} has been cancelled by you.`);
    if (reregisterUntil) {
      lines.push('', `You can still re-register for the ${PROGRAM_NAME} until ${reregisterUntil}.`);
    }
  }
  lines.push(signOff());
  await sendEmail({ to, subject: `Registration cancelled — ${PROGRAM_NAME}`, body: lines.join('\n') });
}

// 2a. Winner notification (auto, on publish).
export async function sendResultWinnerEmail(params: {
  to: string;
  fullName: string;
  resaleTitle: string;
  modelName: string;
  registrationId: string;
}): Promise<void> {
  const { to, fullName, modelName, registrationId } = params;
  await sendEmail({
    to,
    subject: `You won — ${PROGRAM_NAME}`,
    body: [
      `Hi ${firstName(fullName)},`,
      '',
      `Congratulations! You were selected in the ${PROGRAM_NAME} for the ${modelName}.`,
      '',
      `Please review and accept your laptop here: ${link(`/pickup/${registrationId}`)}`,
      `You'll receive a separate email with your pickup date and time.`,
      signOff(),
    ].join('\n'),
  });
}

// 2b. Not-selected notification (auto, on publish). Sent to everyone who did not
// win — including waiting-list runner-ups. A runner-up only hears again if they
// are later promoted (see sendRunnerUpPromotedEmail).
export async function sendResultNotSelectedEmail(params: {
  to: string;
  fullName: string;
  resaleTitle: string;
  resaleId: string;
}): Promise<void> {
  const { to, fullName, resaleId } = params;
  await sendEmail({
    to,
    subject: `Results — ${PROGRAM_NAME}`,
    body: [
      `Hi ${firstName(fullName)},`,
      '',
      `The results for the ${PROGRAM_NAME} have been published. Unfortunately you were not selected this time.`,
      '',
      `Thank you for taking part — we hope to see you next time.`,
      `View the results here: ${link(`/results/${resaleId}`)}`,
      signOff(),
    ].join('\n'),
  });
}

// 3. Runner-up promoted after a forfeit (auto, on waiting-list replacement).
export async function sendRunnerUpPromotedEmail(params: {
  to: string;
  fullName: string;
  resaleTitle: string;
  modelName: string;
  registrationId: string;
}): Promise<void> {
  const { to, fullName, modelName, registrationId } = params;
  await sendEmail({
    to,
    subject: `Good news — a spot opened up in the ${PROGRAM_NAME}`,
    body: [
      `Hi ${firstName(fullName)},`,
      '',
      `You were on the waiting list for the ${PROGRAM_NAME}. One of the winners has forfeited their laptop, and as the next in line you have now been selected for the ${modelName}.`,
      '',
      `Please review and accept your laptop here: ${link(`/pickup/${registrationId}`)}`,
      `You'll receive a separate email with your pickup date and time.`,
      signOff(),
    ].join('\n'),
  });
}

// 4. Pickup details (manual). The admin edits this template in the resale window
// and sends it to every winner who has not declined. The [bracketed] parts show
// where the admin fills in the details.
export const PICKUP_EMAIL_TEMPLATE = {
  subject: `Pickup details — ${PROGRAM_NAME}`,
  body: [
    'Hi {first name},',
    '',
    `Here are the pickup details for your {laptop} from the ${PROGRAM_NAME}.`,
    '',
    'When: [date and time]',
    'Where: [location]',
    '',
    'Please bring your ID. You can review your handover here: {link}',
    signOff(),
  ].join('\n'),
};

// Sends an admin-written email (pickup details, pending notice) to one winner.
// {first name}, {laptop} and {link} are filled in per winner; unknown
// {placeholders} are left exactly as the admin typed them.
export async function sendComposedEmail(params: {
  to: string;
  fullName: string;
  modelName: string;
  registrationId: string;
  subject: string;
  body: string;
}): Promise<void> {
  const values: Record<string, string> = {
    'first name': firstName(params.fullName),
    laptop: params.modelName,
    link: link(`/pickup/${params.registrationId}`),
  };
  const fill = (text: string) =>
    text.replace(/\{([^{}]+)\}/g, (token, key: string) => values[key.trim().toLowerCase()] ?? token);
  await sendEmail({ to: params.to, subject: fill(params.subject), body: fill(params.body) });
}

// 5. Signed purchase agreement (auto, on handover completion). The signed form is
// attached as a PDF (generated + stored at completion) that mirrors the on-screen
// handover record.
export async function sendHandoverCompletedEmail(params: {
  to: string;
  fullName: string;
  resaleTitle: string;
  modelName: string;
  serialNumber?: string | null;
  recordId: string;
  pdf?: Buffer | null;
}): Promise<void> {
  const { to, fullName, modelName, serialNumber, recordId, pdf } = params;
  const attachments = pdf
    ? [{ filename: `purchase-agreement-${recordId}.pdf`, content: pdf, contentType: 'application/pdf' }]
    : undefined;
  await sendEmail({
    to,
    subject: `Your signed purchase agreement — ${PROGRAM_NAME}`,
    body: [
      `Hi ${firstName(fullName)},`,
      '',
      `Your handover for the ${modelName} from the ${PROGRAM_NAME} is complete.`,
      ...(serialNumber ? ['', `Serial number: ${serialNumber}`] : []),
      '',
      attachments
        ? `A copy of your signed purchase agreement is attached as a PDF for your records.`
        : `A copy of your signed purchase agreement will follow separately.`,
      signOff(),
    ].join('\n'),
    attachments,
  });
}

// 6. Win cancelled by an administrator, with reason and admin name (auto).
export async function sendAdminDeclineEmail(params: {
  to: string;
  fullName: string;
  resaleTitle: string;
  modelName: string;
  reason?: string | null;
  adminName: string;
}): Promise<void> {
  const { to, fullName, modelName, reason, adminName } = params;
  await sendEmail({
    to,
    subject: `Your laptop selection was cancelled — ${PROGRAM_NAME}`,
    body: [
      `Hi ${firstName(fullName)},`,
      '',
      `Your selection for the ${modelName} in the ${PROGRAM_NAME} has been cancelled by ${adminName}.`,
      '',
      `Reason: ${reason?.trim() || '(no reason provided)'}`,
      signOff(),
    ].join('\n'),
  });
}

// 7. Employee declined their own laptop (auto). A confirmation only — no appeal,
// since the employee chose to decline.
export async function sendSelfDeclineEmail(params: {
  to: string;
  fullName: string;
  resaleTitle: string;
  modelName: string;
}): Promise<void> {
  const { to, fullName, modelName } = params;
  await sendEmail({
    to,
    subject: `You declined your laptop — ${PROGRAM_NAME}`,
    body: [
      `Hi ${firstName(fullName)},`,
      '',
      `This confirms that you chose to decline the ${modelName} from the ${PROGRAM_NAME}. No further action is needed.`,
      signOff(),
    ].join('\n'),
  });
}
