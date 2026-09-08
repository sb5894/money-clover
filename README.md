# 용돈기입장

현재 https://money-clover.web.app 에 배포되어 있습니다. 관리자 사용법과 현재 배포 구성은 [DEPLOYMENT.md](DEPLOYMENT.md)를 참고하세요.

학생이 날짜별로 들어온 돈과 나간 돈을 기록하는 모바일 우선 웹앱입니다. 홈 탭에는 현재 잔액과 이번 달 용돈 흐름이 보이고, 기입장 탭에는 선택한 날짜의 기록표와 추가 버튼만 보입니다. 로그인하면 CSV에 등록된 본인 이름을 표시합니다. 잔액은 모든 기록을 날짜와 생성 순서로 정렬해 자동 계산합니다. 과거 기록을 수정하거나 삭제하면 이후 잔액도 다시 계산합니다. React + Vite, Firebase Authentication / Firestore / Cloud Functions / Hosting 구성을 사용합니다.

## 지금 확인하기

```powershell
npm install
npm run dev -- --host 127.0.0.1
```

터미널에 표시되는 localhost 주소를 엽니다. Firebase 환경 변수를 넣지 않으면 **장부가 이 브라우저에만 저장되는 로컬 모드**입니다. 현재 프로젝트의 `studentlist.csv`에 등록된 학생 번호와 비밀번호로 로그인할 수 있습니다. CSV가 없으면 아래 가상 계정과 예시 기록을 사용합니다. 로컬 기록과 비밀번호 변경은 Firebase로 자동 이전하지 않습니다.

Windows PowerShell에서 실행 정책 때문에 `npm.ps1` 오류가 나면 명령의 `npm`을 `npm.cmd`로 바꿔 실행하세요.

| 학생 번호 | 비밀번호 | 화면 별명 |
| --- | --- | --- |
| 01 | 1234 | 초록 클로버 |
| 02 | 2345 | 행운 클로버 |
| 03 | 3456 | 햇살 클로버 |

학생 계정을 바꿔도 기록은 각 계정별로 분리되어 유지됩니다. 위 가상 계정 비밀번호만 기능 확인용으로 브라우저 코드에 들어 있습니다. 실제 CSV는 Vite 개발 서버에서만 읽고 비밀번호를 검증하며, 전체 명단과 비밀번호는 브라우저로 전송하지 않습니다. 로그인한 본인의 이름만 프로필에 표시합니다. CSV 기반 로그인은 localhost에서만 사용할 수 있습니다. 브라우저 저장 공간을 지우면 로컬 장부가 사라집니다.

프로필의 비밀번호 변경에서 **현재 비밀번호와 새 숫자 4자리 비밀번호**를 입력하면 됩니다. 매번 CSV를 수정할 필요가 없습니다. 로컬에서 바꾼 비밀번호는 `.private/pin-overrides.json`에 salt와 scrypt 해시로 저장하고, 새로고침이나 개발 서버 재시작 후에도 유지합니다. 원본 CSV는 변경하지 않습니다. 개발 서버를 재시작하면 새 비밀번호로 다시 로그인합니다. `.private`는 git과 웹 공개 대상에서 제외됩니다. 가상 계정에서 바꾼 비밀번호는 해당 브라우저에 저장됩니다.

```powershell
npm test
node --test scripts/dev-roster.test.js
npm run test:ui
npm run build
```

## 실제 명단 준비

현재 `studentlist.csv`의 22명 명단을 로컬 로그인에 연결했습니다. `scripts/students.example.csv`는 가상의 세 학생 예시입니다. UTF-8 CSV 헤더는 `number,name,password` 또는 `번호,이름,비밀번호`를 사용합니다. `nickname` 또는 `별명` 열은 선택 사항입니다. 명단 파일은 프로젝트 루트의 `studentlist.csv`에 둡니다.

```csv
번호,이름,비밀번호,별명
01,학생이름,0123,초록 클로버
```

비밀번호는 숫자 4자리이며 `0123`의 앞자리 0을 유지해야 합니다. 엑셀에서는 비밀번호 열을 텍스트로 지정하세요. 학생 번호는 1~6자리 숫자를 사용하며 1과 01은 같은 학생입니다. 번호는 장부의 고유 식별자이므로 기존 번호를 다른 학생에게 재사용하지 마세요. `name` 또는 `이름` 열을 화면 표시 이름으로 사용합니다. Firebase 등록 시에도 이 이름을 저장하고, 로그인한 본인에게만 돌려줍니다. 이름이 없는 구형 명단은 별명, 학생 번호 순서로 대체 표시합니다.

## Firebase 연결 및 배포 준비

1. Firebase 프로젝트와 웹앱을 만들고 Firestore 데이터베이스를 생성합니다. Authentication에서 익명(Anonymous) 로그인 제공업체를 켭니다. Cloud Functions 배포에는 Blaze 요금제 설정이 필요합니다. [익명 로그인 안내](https://firebase.google.com/docs/auth/web/anonymous-auth), [Functions 시작하기](https://firebase.google.com/docs/functions/get-started)
2. `.env.example`을 `.env.local`로 복사하고 웹앱 설정의 API key, auth domain, project ID, app ID 네 값을 넣습니다. 함수 지역의 기본값은 `asia-northeast3`입니다. 지역을 바꾸면 `functions/index.js`도 동일하게 변경합니다. 환경 변수가 일부만 있으면 설정 오류를 표시하며 체험 모드로 조용히 전환하지 않습니다.
3. Firebase CLI를 설치하고 로그인합니다. 아래 명령에서 `YOUR_PROJECT_ID`를 실제 프로젝트 ID로 바꿉니다. Node.js 22를 권장합니다.

```powershell
npm install --global firebase-tools
firebase login
npm --prefix functions install
firebase use --add
```

4. 명단 등록 스크립트는 Firebase Admin SDK를 사용합니다. 로컬 관리자 인증을 준비하세요. 예: Google Cloud CLI의 `gcloud auth application-default login`. 서비스 계정 키를 사용하는 경우 키를 프로젝트 바깥에 보관하고 `GOOGLE_APPLICATION_CREDENTIALS`로 지정하세요. 웹앱의 `VITE_` 환경 변수에 관리자 키를 넣으면 안 됩니다.

```powershell
node scripts/import-students.mjs students.csv --project=YOUR_PROJECT_ID
node scripts/import-students.mjs students.csv --project=YOUR_PROJECT_ID --apply
```

첫 명령은 형식만 검증하며 서버를 변경하지 않습니다. 실제 파일명이 `studentlist.csv`이면 명령의 `students.csv` 부분을 바꿉니다. `--apply`를 넣으면 새 학생의 salt와 scrypt 비밀번호 해시를 서버 전용 문서에 저장합니다. 공개 예시 CSV를 그대로 서버에 등록하는 것은 차단됩니다. 같은 번호를 다시 등록하면 **기존 장부와 학생이 변경한 비밀번호를 보존**합니다. CSV에서 빠진 학생은 자동으로 삭제하지 않습니다.

학생이 비밀번호를 잊은 경우에는 해당 학생만 담은 CSV를 준비하고 `--apply --reset-pins`를 함께 주면 CSV 값으로 명시적으로 초기화합니다. 이 옵션은 입력 CSV에 포함된 기존 학생 모두의 비밀번호를 초기화하므로 대상 학생만 넣으세요. 초기화하면 연결된 기기는 다시 로그인해야 합니다. 정상적인 학생 비밀번호 변경은 앱에서 처리하며 CSV 재등록이 필요하지 않습니다.

5. 로컬에서 Firebase 연결을 확인하고 사용자 검토를 마친 뒤 배포합니다. 현재 프로젝트에는 배포를 완료했으며, 이후 변경도 아래 명령으로 반영할 수 있습니다.

```powershell
npm run build
firebase deploy --only firestore,functions,hosting --project YOUR_PROJECT_ID
```

Hosting은 `dist`만 공개하므로 원본 CSV와 관리자 스크립트가 웹에 배포되지 않습니다. CSV와 `.env.local`은 git에서도 제외합니다. [Hosting 배포 안내](https://firebase.google.com/docs/hosting/quickstart)

## 학생별 접근 방식

학생은 번호와 숫자 4자리 비밀번호로 들어옵니다. 내부적으로 Firebase 익명 계정을 만들고 callable 함수가 비밀번호를 검증하여 해당 UID를 학생 장부에 연결합니다. 같은 번호와 비밀번호로 다른 기기에서 로그인하면 같은 장부를 사용합니다. 로그인한 학생의 이름을 화면에 표시합니다. Firebase 익명 인증은 내부 인증 방식으로 계속 사용합니다. [Callable 함수 안내](https://firebase.google.com/docs/functions/callable)

앱에서 비밀번호를 바꾸면 서버가 현재 비밀번호를 확인한 뒤 새 salt와 해시를 저장합니다. 현재 기기는 계속 사용하고 다른 기기는 새 비밀번호로 다시 로그인해야 합니다. 비밀번호 변경 시도에도 로그인과 같은 실패 횟수 제한을 적용합니다.

Firestore 규칙은 로그인한 UID에 연결된 학생의 기록만 읽고 쓸 수 있게 제한합니다. 학생 명단, 비밀번호 해시, 로그인 시도 기록은 클라이언트가 읽을 수 없습니다. 비밀번호 네 자리는 가능한 조합이 적기 때문에 서버는 15분 동안 실패한 로그인을 학생 번호당 5회, UID당 10회, IP당 100회로 제한합니다. 번호별 제한은 다른 익명 계정을 새로 만들어도 유지됩니다. Firebase App Check는 아직 설정하지 않았으며 운영 환경에 맞게 추가할 수 있습니다.

학생 접근을 중지하려면 Admin SDK 또는 Firebase 콘솔에서 `students/student-번호` 문서의 `active`를 `false`로 바꿉니다. `loginAttempts.expiresAt`에 Firestore TTL 정책을 설정하면 지난 시도 문서를 자동 정리할 수 있습니다. TTL 없이도 15분 제한 창은 자동 만료되지만 오래된 문서는 남습니다.

## 확인 범위

자동 잔액 계산, 과거 기록 변경, 날짜 이동, 입력 검증 테스트 5개가 통과했습니다. `scripts/dev-roster.test.js`는 가상 명단으로 비밀번호 변경·재시작 후 유지·앞자리 0·실패 횟수 제한·CSV 비공개·원본 보존을 확인하며 2개 테스트가 통과했습니다. Playwright 브라우저 테스트 2개도 통과했습니다. 실제 명단 로그인, 기록 추가·수정·삭제, 과거 날짜 잔액 반영, 새로고침 후 저장, 계정별 기록 분리, CSV 다운로드, 비밀번호 재입력 일치 검증, 명단 다운로드 차단을 확인했습니다. 320·360·390·768·1024·1440px 화면 너비에서 가로 넘침이 없는 것도 확인했습니다. 실제 명단의 비밀번호는 테스트에서 변경하지 않았습니다.

브라우저 테스트는 개발 서버를 실행한 상태에서 `npm run test:ui`로 실행합니다. 현재는 설치된 Microsoft Edge를 사용하도록 설정되어 있으며 화면 캡처는 `artifacts/`에 생성됩니다. 현재 실제 Firebase의 학생·관리자 인증, 기록 저장·수정·삭제, 학생별 접근 차단, 비밀번호 변경과 재로그인 검증을 완료했습니다. 공개 주소의 관리자 현황·전체 기록·학생 화면 보기·실제 학생 로그인도 확인했습니다. 임시 테스트 계정은 정리했으며 실제 학생 장부는 변경하지 않았습니다.

서버 패키지는 작성 시 확인한 `firebase-admin 14.3.0`, `firebase-functions 7.3.2`를 사용합니다. 최신 버전에서도 Google Cloud Storage의 간접 의존성 `uuid` 관련 중간 등급 npm 감사 경고가 남아 있으므로 실제 배포 전에 상위 SDK 업데이트를 재확인하세요. 이 앱은 Cloud Storage를 사용하지 않습니다.
