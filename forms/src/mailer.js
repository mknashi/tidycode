/**
 * Email delivery through SMTP (Amazon SES in production).
 */

import nodemailer from 'nodemailer';

/**
 * Build the email for a submission. Plain text only, so submitted content
 * can never render as HTML in the recipient's mail client.
 * @param {Object} site - Site config
 * @param {Object} submission - Stored submission row
 * @param {string} defaultFrom - MAIL_FROM
 */
export function buildEmail(site, submission, defaultFrom) {
  const sender = submission.name || submission.email || 'anonymous';
  const lines = [
    `New message from the ${site.name} contact form.`,
    '',
    `Name:  ${submission.name || '(not given)'}`,
    `Email: ${submission.email || '(not given)'}`,
  ];
  if (submission.page) lines.push(`Page:  ${submission.page}`);
  for (const [key, value] of Object.entries(submission.meta || {})) {
    lines.push(`${key}: ${value}`);
  }
  lines.push('', '---', '', submission.message, '', '---', `Submission #${submission.id} · ${submission.created_at}`);

  return {
    from: site.from || defaultFrom,
    to: site.to,
    // Replies go to the person who wrote in; the form itself never emails them
    replyTo: submission.email || undefined,
    subject: `[${site.name}] Message from ${sender}`.slice(0, 200),
    text: lines.join('\n'),
  };
}

export function createMailer({ host, port, user, pass, from }) {
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return {
    /** @throws When the SMTP server rejects the message */
    async send(site, submission) {
      await transport.sendMail(buildEmail(site, submission, from));
    },
    verify: () => transport.verify(),
  };
}
