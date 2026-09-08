import { googleRequest } from './firebase-cli-session.mjs';

const project = 'money-clover';
const action = process.argv[2];
const billingUrl = `https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`;
const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;

if (action === 'status') {
  for (const [label, url] of [
    ['billing', billingUrl],
    ['billingAccounts', 'https://cloudbilling.googleapis.com/v1/billingAccounts'],
    ['auth', configUrl],
    ['databases', `https://firestore.googleapis.com/v1/projects/${project}/databases`],
  ]) {
    try {
      const result = await googleRequest(url);
      if (label === 'auth') console.log(label, JSON.stringify({ anonymous: result.signIn?.anonymous?.enabled || false, authorizedDomains: result.authorizedDomains || [] }));
      else if (label === 'billingAccounts') console.log(label, JSON.stringify(result.billingAccounts?.map(({ name, displayName, open }) => ({ name, displayName, open })) || []));
      else if (label === 'databases') console.log(label, JSON.stringify(result.databases?.map(({ name, locationId, type }) => ({ name, locationId, type })) || []));
      else console.log(label, JSON.stringify(result));
    } catch (error) { console.log(label, error.message); }
  }
} else if (action === 'connect-billing') {
  const requestedAccount = process.argv[3];
  if (!/^billingAccounts\/[A-Z0-9-]+$/.test(requestedAccount || '')) throw new Error('연결할 기존 결제 계정 ID가 필요합니다.');
  const current = await googleRequest(billingUrl);
  if (current.billingAccountName && current.billingAccountName !== requestedAccount) throw new Error('프로젝트에 이미 다른 결제 계정이 연결되어 있어 변경하지 않았습니다.');
  const accounts = await googleRequest('https://cloudbilling.googleapis.com/v1/billingAccounts');
  if (!accounts.billingAccounts?.some(value => value.name === requestedAccount && value.open)) throw new Error('접근 가능한 활성 결제 계정이 아닙니다.');
  const result = current.billingEnabled ? current : await googleRequest(billingUrl, { method: 'PUT', body: { billingAccountName: requestedAccount } });
  console.log(JSON.stringify({ project, billingEnabled: result.billingEnabled, billingAccountName: result.billingAccountName }));
} else if (action === 'setup-auth') {
  let config;
  try { config = await googleRequest(configUrl); }
  catch (error) {
    if (![400, 404].includes(error.status)) throw error;
    await googleRequest(`https://identitytoolkit.googleapis.com/v2/projects/${project}/identityPlatform:initializeAuth`, { method: 'POST', body: {} });
    config = await googleRequest(configUrl);
  }
  const domains = [...new Set([...(config.authorizedDomains || []), `${project}.web.app`, `${project}.firebaseapp.com`, 'localhost'])];
  const result = await googleRequest(`${configUrl}?updateMask=signIn.anonymous.enabled,authorizedDomains`, { method: 'PATCH', body: { signIn: { anonymous: { enabled: true } }, authorizedDomains: domains } });
  console.log(JSON.stringify({ project, anonymousEnabled: result.signIn?.anonymous?.enabled, authorizedDomains: result.authorizedDomains }));
} else {
  throw new Error('사용법: node scripts/setup-firebase.mjs status | connect-billing billingAccounts/ID | setup-auth');
}
