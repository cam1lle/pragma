import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    const host = process.env.SMTP_HOST || '';
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const from = process.env.FROM_EMAIL || 'noreply@pragma.local';

    if (!host || !user || !pass) {
      console.warn('Email service not fully configured; emails will not be sent');
      // Create a dummy transporter that does nothing
      this.transporter = nodemailer.createTransport({
        host: '',
        port: 0,
        auth: { user: '', pass: '' },
      });
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
    });

    // Verify connection configuration
    this.transporter.verify().catch(err => {
      console.error('SMTP connection failed:', err);
    });
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: process.env.FROM_EMAIL || 'noreply@pragma.local',
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();