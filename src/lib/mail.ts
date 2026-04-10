import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST ?? 'host.docker.internal',
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD,
  },
  tls: {
    // Self-signed cert from Maddy on localhost is OK
    rejectUnauthorized: false,
  },
})

export async function sendMail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  return transporter.sendMail({
    from: `"Messme" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html,
  })
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
