import nodemailer from 'nodemailer';

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️  WARNING: EMAIL_USER or EMAIL_PASS not set in .env — emails will not be sent.');
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

export const sendWelcomeEmail = async (clientEmail, clientName, serviceType) => {
    if (!clientEmail) return;
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn('Email not sent — credentials missing in .env');
        return false;
    }

    const aiGeneratedDetails = getSmartResponse(serviceType);

    const clientMail = {
        from: `"Universal CRM" <${process.env.EMAIL_USER}>`,
        to: clientEmail,
        subject: `Regarding your inquiry: ${serviceType || 'Services'}`,
        html: `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #6366f1;">Hello ${clientName},</h2>
        <p>Thank you for reaching out about <strong>${serviceType || 'our services'}</strong>.</p>
        <p>${aiGeneratedDetails}</p>
        <p>To move forward, I would love to schedule a quick call to discuss your specific needs.</p>
        <div style="margin: 20px 0;">
            <a href="${process.env.CALENDLY_URL || '#'}" style="background-color: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Schedule a Meeting
            </a>
        </div>
        <p>Alternatively, feel free to reply to this email.</p>
        <br>
        <p>Best regards,</p>
        <p><strong>The Universal CRM Team</strong></p>
      </div>
    `
    };

    const ownerMail = {
        from: `"Universal CRM" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_USER,
        subject: `New inquiry from ${clientName}`,
        html: `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #6366f1;">New inquiry received</h2>
        <table style="border-collapse: collapse; width: 100%;">
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${clientName}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Email</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${clientEmail}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Service</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${serviceType || '-'}</td></tr>
        </table>
      </div>
    `
    };

    try {
        await transporter.sendMail(clientMail);
        console.log(`Welcome email sent to ${clientEmail}`);
        await transporter.sendMail(ownerMail);
        console.log(`Owner notification sent to ${process.env.EMAIL_USER}`);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

function getSmartResponse(serviceType) {
    if (!serviceType) return "We specialize in providing top-tier solutions for businesses of all sizes.";

    const lower = serviceType.toLowerCase();

    if (lower.includes('web') || lower.includes('design') || lower.includes('site')) {
        return "I see you're interested in digital presence. Our team creates stunning, high-performance websites that drive conversion.";
    }
    if (lower.includes('consult') || lower.includes('advise') || lower.includes('консулт')) {
        return "Expert advice is crucial for growth. Our consultation services are designed to identify bottlenecks and unlock new opportunities for your company.";
    }
    if (lower.includes('marketing') || lower.includes('seo')) {
        return "Visibility is key. We have a proven track record of improving reach and engagement through targeted marketing strategies.";
    }

    return "We are excited to hear more about your project and see how we can deliver value to your business.";
}
