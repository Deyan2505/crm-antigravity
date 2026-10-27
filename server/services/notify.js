import nodemailer from 'nodemailer';

let transporter;

// Owner-only notification (plain text, no HTML: lead fields are untrusted input). Never mails the lead.
export async function notifyOwner(lead) {
    const to = process.env.OWNER_NOTIFY_EMAIL;
    if (!to || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn('Owner notification skipped: OWNER_NOTIFY_EMAIL / EMAIL_USER / EMAIL_PASS not set');
        return false;
    }
    transporter ??= nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    const line = (label, v) => `${label}: ${String(v || '-').replace(/[\r\n]+/g, ' ').slice(0, 500)}`;
    await transporter.sendMail({
        from: `"Universal CRM" <${process.env.EMAIL_USER}>`,
        to,
        subject: 'New ARIE inquiry',
        text: [
            line('Name', lead.name), line('Email', lead.email), line('Phone', lead.phone), line('Company', lead.company),
            line('Services', lead.services), line('Budget', lead.price_range), line('Language', lead.lang),
            line('Notes', lead.notes), line('Tally submission', lead.submissionId)
        ].join('\n')
    });
    return true;
}
