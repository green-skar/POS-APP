/** Default: process.env. Server calls setMpesaEnvResolver() to merge DB + env. */
function defaultMpesaEnv() {
  return {
    MPESA_ENV: process.env.MPESA_ENV,
    MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
    MPESA_SHORTCODE: process.env.MPESA_SHORTCODE,
    MPESA_PASSKEY: process.env.MPESA_PASSKEY,
    MPESA_CALLBACK_URL: process.env.MPESA_CALLBACK_URL,
  };
}

let resolveMpesaEnv = () => defaultMpesaEnv();

/**
 * @param {() => Record<string, string | undefined>} fn
 */
export function setMpesaEnvResolver(fn) {
  resolveMpesaEnv = typeof fn === 'function' ? fn : defaultMpesaEnv;
}

/** True if Daraja STK can run (DB + env merged). */
export function isMpesaConfiguredPublic() {
  const e = mpesaEnv();
  return Boolean(
    e.MPESA_CONSUMER_KEY && e.MPESA_CONSUMER_SECRET && e.MPESA_SHORTCODE && e.MPESA_PASSKEY
  );
}

function mpesaEnv() {
  try {
    const e = resolveMpesaEnv();
    return {
      MPESA_ENV: e.MPESA_ENV,
      MPESA_CONSUMER_KEY: e.MPESA_CONSUMER_KEY,
      MPESA_CONSUMER_SECRET: e.MPESA_CONSUMER_SECRET,
      MPESA_SHORTCODE: e.MPESA_SHORTCODE,
      MPESA_PASSKEY: e.MPESA_PASSKEY,
      MPESA_CALLBACK_URL: e.MPESA_CALLBACK_URL,
    };
  } catch {
    return defaultMpesaEnv();
  }
}

function getDarajaBaseUrl() {
  return mpesaEnv().MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

function getTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function formatPhoneNumber(phone) {
  const digits = String(phone).replace(/\D/g, '');

  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('7')) return `254${digits}`;

  throw new Error('Use a valid Kenyan number (07..., 7..., or 2547...)');
}

async function getAccessToken() {
  const env = mpesaEnv();
  const key = env.MPESA_CONSUMER_KEY;
  const secret = env.MPESA_CONSUMER_SECRET;

  if (!key || !secret) {
    throw new Error('Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET');
  }

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const base = getDarajaBaseUrl();
  const response = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get Daraja token: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function initiateSTKPush({ phoneNumber, amount, accountReference, transactionDesc }) {
  const env = mpesaEnv();
  const shortcode = env.MPESA_SHORTCODE;
  const passkey = env.MPESA_PASSKEY;
  const callbackUrl = env.MPESA_CALLBACK_URL;

  if (!shortcode || !passkey || !callbackUrl) {
    throw new Error('Missing MPESA_SHORTCODE, MPESA_PASSKEY, or MPESA_CALLBACK_URL');
  }

  const token = await getAccessToken();
  const timestamp = getTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  const base = getDarajaBaseUrl();

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(Number(amount)),
    PartyA: phoneNumber,
    PartyB: shortcode,
    PhoneNumber: phoneNumber,
    CallBackURL: callbackUrl,
    AccountReference: accountReference || 'POS_SALE',
    TransactionDesc: transactionDesc || 'Payment',
  };

  const response = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || data.ResponseCode !== '0') {
    throw new Error(data.errorMessage || data.ResponseDescription || 'Daraja STK push request failed');
  }

  return {
    merchantRequestID: data.MerchantRequestID,
    checkoutRequestID: data.CheckoutRequestID,
    customerMessage: data.CustomerMessage || 'STK Push sent',
  };
}

export function validateCallback(callbackData) {
  return Boolean(
    callbackData &&
      callbackData.Body &&
      callbackData.Body.stkCallback &&
      callbackData.Body.stkCallback.CheckoutRequestID
  );
}

export function parseCallback(callbackData) {
  const cb = callbackData.Body.stkCallback;
  const metadata = cb.CallbackMetadata?.Item || [];
  const getValue = (name) => metadata.find((i) => i.Name === name)?.Value;

  return {
    merchantRequestID: cb.MerchantRequestID,
    checkoutRequestID: cb.CheckoutRequestID,
    resultCode: cb.ResultCode,
    resultDesc: cb.ResultDesc,
    success: Number(cb.ResultCode) === 0,
    amount: getValue('Amount') ?? null,
    mpesaReceiptNumber: getValue('MpesaReceiptNumber') ?? null,
    transactionID: getValue('MpesaReceiptNumber') ?? null,
    transactionDate: getValue('TransactionDate') ?? null,
    phoneNumber: getValue('PhoneNumber') ?? null,
    /** Shown on POS confirmation when available */
    firstName: getValue('FirstName') ?? getValue('Name') ?? null,
  };
}
