import { build, loadEnv } from 'vite';

// Publishing a browser-only preview would silently disable cloud authentication.
const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];
const missing = required.filter(key => !env[key]?.trim());
if (missing.length) {
  throw new Error(`Firebase 배포 설정이 없습니다: ${missing.join(', ')}. .env.production.local에 실제 프로젝트 설정을 먼저 넣어 주세요.`);
}
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== env.VITE_FIREBASE_PROJECT_ID) {
  throw new Error('배포 대상과 웹앱 Firebase 프로젝트가 다릅니다. 프로젝트 ID를 확인해 주세요.');
}
await build({ mode: 'production' });
