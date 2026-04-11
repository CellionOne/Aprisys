import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? 'Aprisys <noreply@aprisys.com>';
const APP_URL = process.env.APP_URL ?? 'http://localhost:5000';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

function footer() {
  return `
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e4e0;font-size:12px;color:#aaa;line-height:1.6">
    <p>Aprisys — Powered by Cellion One Ltd &bull; Lagos, Nigeria</p>
    <p>All market content is for informational purposes only and does not constitute investment advice.<br>
    Past performance is not indicative of future results. Regulated activities require appropriate authorisation.</p>
    <p>This message is sent in accordance with the Nigeria Data Protection Regulation (NDPR).</p>
  </div>`;
}

function wrap(content: string) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:580px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:12px;border:1px solid #e5e4e0;padding:36px 40px;">
      <p style="margin:0 0 24px;font-size:11px;color:#aaa;letter-spacing:0.1em;text-transform:uppercase">Aprisys</p>
      ${content}
      ${footer()}
    </div>
  </div></body></html>`;
}

export async function sendVerificationEmail(email: string, name: string, token: string) {
  const url = `${APP_URL}/auth/verify-email?token=${token}`;
  await resend.emails.send({
    from: FROM, to: email,
    subject: 'Verify your Aprisys account',
    html: wrap(`
      <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;color:#1a1a1a">Welcome, ${name}</h1>
      <p style="color:#555;margin:0 0 28px;line-height:1.6">Please verify your email address to activate your account.</p>
      <a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:500">Verify email address</a>
      <p style="margin:24px 0 0;font-size:13px;color:#aaa">This link expires in 24 hours. If you didn't create this account, ignore this email.</p>`)
  });
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const url = `${FRONTEND_URL}/auth/reset-password?token=${token}`;
  await resend.emails.send({
    from: FROM, to: email,
    subject: 'Reset your Aprisys password',
    html: wrap(`
      <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;color:#1a1a1a">Password reset</h1>
      <p style="color:#555;margin:0 0 28px;line-height:1.6">Hi ${name}, click below to reset your password. This link expires in 1 hour.</p>
      <a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px">Reset password</a>
      <p style="margin:24px 0 0;font-size:13px;color:#aaa">If you didn't request this, your account is safe.</p>`)
  });
}

export async function sendKycSubmittedEmail(email: string, name: string, entity_type: string) {
  const timelines: Record<string, string> = {
    stockbroker: '24 hours', institutional: '48 hours',
    individual: 'a few hours', qualified_individual: 'a few hours',
    fund_manager: '24 hours', corporate: '24 hours'
  };
  const timeline = timelines[entity_type] ?? '24 hours';
  await resend.emails.send({
    from: FROM, to: email,
    subject: 'KYC documents received — Aprisys',
    html: wrap(`
      <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;color:#1a1a1a">Documents received</h1>
      <p style="color:#555;margin:0 0 16px;line-height:1.6">Hi ${name}, we've received your verification documents and they're under review.</p>
      <div style="background:#f8f7f4;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="margin:0;font-size:14px;color:#555">Expected review time: <strong>${timeline}</strong></p>
      </div>
      <p style="color:#555;font-size:13px">You'll receive an email as soon as your review is complete.</p>`)
  });
}

export async function sendKycApprovedEmail(email: string, name: string, account_type: string) {
  const accessMap: Record<string, string> = {
    qualified: 'participate in deals as an investor on the Aprisys deal marketplace',
    broker: 'create and manage deals, invite counterparties, and earn commission',
    fund_manager: 'lead deals, deploy capital, and access full portfolio tracking',
    corporate: 'participate in structured deals and private placements',
    institutional: 'access all platform features including large-ticket deals and API access'
  };
  const access = accessMap[account_type] ?? 'access your verified account features';
  await resend.emails.send({
    from: FROM, to: email,
    subject: 'Your account is verified — Aprisys',
    html: wrap(`
      <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;color:#1a1a1a">Account verified</h1>
      <p style="color:#555;margin:0 0 16px;line-height:1.6">Congratulations, ${name}. Your identity has been verified.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="margin:0;font-size:14px;color:#166534">You can now ${access}.</p>
      </div>
      <a href="${FRONTEND_URL}/deals" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px">Access deals platform</a>`)
  });
}

export async function sendKycRejectedEmail(email: string, name: string, reason: string) {
  const resubmitUrl = `${FRONTEND_URL}/kyc`;
  await resend.emails.send({
    from: FROM, to: email,
    subject: 'Action required: KYC verification — Aprisys',
    html: wrap(`
      <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;color:#1a1a1a">Verification unsuccessful</h1>
      <p style="color:#555;margin:0 0 16px;line-height:1.6">Hi ${name}, we were unable to verify your account with the documents provided.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#991b1b">Reason:</p>
        <p style="margin:0;font-size:14px;color:#7f1d1d">${reason}</p>
      </div>
      <a href="${resubmitUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px">Resubmit documents</a>`)
  });
}

export async function sendDealInvitationEmail(
  email: string, name: string,
  deal: { reference: string; title: string; deal_type: string; total_value: number; currency: string },
  role: string, inviter_name: string, accept_token: string, decline_token: string
) {
  const acceptUrl = `${APP_URL}/deals/respond?token=${accept_token}&response=accepted`;
  const declineUrl = `${APP_URL}/deals/respond?token=${decline_token}&response=declined`;
  await resend.emails.send({
    from: FROM, to: email,
    subject: `Deal invitation: ${deal.reference} — Aprisys`,
    html: wrap(`
      <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;color:#1a1a1a">You've been invited to a deal</h1>
      <p style="color:#555;margin:0 0 20px;line-height:1.6">${inviter_name} has invited you to participate in a deal as <strong>${role}</strong>.</p>
      <div style="background:#f8f7f4;border-radius:10px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:12px;color:#aaa;text-transform:uppercase;letter-spacing:0.05em">${deal.reference}</p>
        <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1a1a1a">${deal.title}</p>
        <p style="margin:0;font-size:14px;color:#555">${deal.deal_type.toUpperCase()} &bull; ${deal.currency} ${(deal.total_value ?? 0).toLocaleString()}</p>
      </div>
      <div style="display:flex;gap:12px">
        <a href="${acceptUrl}" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500">Accept invitation</a>
        <a href="${declineUrl}" style="display:inline-block;background:#fff;color:#555;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;border:1px solid #e5e4e0">Decline</a>
      </div>`)
  });
}

export async function sendDealStatusEmail(
  email: string, name: string,
  deal_reference: string, status: string, message: string
) {
  await resend.emails.send({
    from: FROM, to: email,
    subject: `Deal update: ${deal_reference} — Aprisys`,
    html: wrap(`
      <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;color:#1a1a1a">Deal update</h1>
      <p style="color:#555;margin:0 0 16px">Hi ${name},</p>
      <div style="background:#f8f7f4;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:12px;color:#aaa;text-transform:uppercase">${deal_reference}</p>
        <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#1a1a1a">${status}</p>
        <p style="margin:0;font-size:14px;color:#555">${message}</p>
      </div>
      <a href="${FRONTEND_URL}/deals" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px">View deal</a>`)
  });
}

export async function sendAccountSuspendedEmail(email: string, name: string, reason: string) {
  await resend.emails.send({
    from: FROM, to: email,
    subject: 'Account suspended — Aprisys',
    html: wrap(`
      <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;color:#1a1a1a">Account suspended</h1>
      <p style="color:#555;margin:0 0 16px;line-height:1.6">Hi ${name}, your Aprisys account has been suspended.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#991b1b">Reason:</p>
        <p style="margin:0;font-size:14px;color:#7f1d1d">${reason}</p>
      </div>
      <p style="color:#555;font-size:13px">If you believe this is an error, contact support@aprisys.com</p>`)
  });
}

export async function sendDigestEmail(opts: {
  email: string; name: string; digestHtml: string;
  openToken: string; unsubToken: string; date: string;
}) {
  const trackingPixel = `${APP_URL}/digest/track/open/${opts.openToken}`;
  const unsubUrl = `${APP_URL}/digest/unsubscribe/${opts.unsubToken}`;
  const result = await resend.emails.send({
    from: FROM, to: opts.email,
    subject: `Aprisys Market Digest — ${new Date(opts.date).toLocaleDateString('en-NG', { weekday: 'long', month: 'long', day: 'numeric' })}`,
    html: opts.digestHtml
      .replace('{{UNSUB_URL}}', unsubUrl)
      .replace('{{SUBSCRIBER_NAME}}', opts.name)
      .replace('</body>', `<img src="${trackingPixel}" width="1" height="1" style="display:none"/>\n</body>`),
  });
  return result;
}
