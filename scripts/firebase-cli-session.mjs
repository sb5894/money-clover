import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

// Reuse the installed CLI login in memory; never print or write its tokens.
const cli = createRequire(resolve(process.env.FIREBASE_TOOLS_DIR || resolve(dirname(process.execPath), 'node_modules/firebase-tools'), 'package.json'));
const auth = cli('./lib/auth.js');
const account = auth.getProjectDefaultAccount(process.cwd());
if (!account) throw new Error('먼저 firebase login으로 로그인해 주세요.');
auth.setActiveAccount({}, account);

export const cliCredential = {
  async getAccessToken() {
    const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
    return { access_token: token.access_token, expires_in: Math.max(60, Math.floor(((token.expires_at || Date.now() + 3600000) - Date.now()) / 1000)) };
  },
};

export async function googleRequest(url, { method = 'GET', body } = {}) {
  const allowed = ['cloudbilling.googleapis.com', 'identitytoolkit.googleapis.com', 'serviceusage.googleapis.com', 'firestore.googleapis.com'];
  if (!allowed.includes(new URL(url).hostname)) throw new Error('지원하지 않는 Google API입니다.');
  const { access_token } = await cliCredential.getAccessToken();
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(`${response.status}: ${result.error?.message || 'Google API request failed'}`);
    error.status = response.status;
    throw error;
  }
  return result;
}
