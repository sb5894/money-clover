# 배포된 용돈기입장

- 공개 주소: https://money-clover.web.app
- 프로젝트: money-clover
- Firebase Authentication: 익명 로그인 + 서버 학생/관리자 비밀번호 검증
- 서버 함수: bindStudent, changeStudentPassword, adminLogin (asia-northeast3)
- Firestore: (default), nam5
- 학생 명단: studentlist.csv 22명 등록
- 기존 활성 결제 계정을 프로젝트에 연결하여 Blaze 활성화
- 함수 빌드 이미지: asia-northeast3/gcf-artifacts 저장소에서 7일 후 정리

## 학생 사용

CSV의 번호와 네 자리 비밀번호로 로그인합니다. 홈에는 현재 잔액과 용돈 흐름, 기입장에는 날짜별 기록표와 추가 버튼이 보입니다. 프로필에서 비밀번호를 바꿀 수 있으며 원본 CSV는 수정하지 않습니다.

## 관리자 사용

로그인 창 아래 **선생님 로그인**을 누르고 별도로 전달받은 관리자 비밀번호를 입력합니다.

전체 학생의 들어온 돈·나간 돈·현재 잔액을 조회할 수 있습니다. 전체 기간 또는 월별 합계로 전환하고 이름·번호로 검색할 수 있습니다. 학생 이름을 누르면 날짜순 전체 기록이 나옵니다. **학생 화면으로 보기**를 누르면 관리자 권한으로 해당 학생의 기입장에서 기록을 확인하거나 수정할 수 있습니다. 위쪽 **관리자 화면** 버튼으로 돌아갑니다.

학생 로그인 입력란에는 관리자 비밀번호 우회 기능을 넣지 않았습니다. 관리자 인증 후 학생을 선택하는 흐름으로 동일한 접근을 제공합니다. 학생의 기존 비밀번호는 그대로 유지됩니다. 관리자 PIN은 서버 전용 설정 문서에 salt와 scrypt 해시로 저장됩니다. 공개 앱 코드에는 PIN이 없습니다.

## 검증

- 로컬 브라우저 테스트: 학생 기록 기능, 관리자 합계·검색·전체 기록·학생 화면 전환·로그인 유지 통과
- 실제 Firebase: 학생 로그인, 기록 생성·수정·삭제, 타 학생 접근 차단, 비밀번호 변경 후 이전 세션 차단 및 새 비밀번호 로그인 통과
- 실제 Firebase 관리자: 전체 명단 조회, 학생 기록 읽기·수정, 관리자 권한 위조 차단, 학생 로그인으로 전환 시 이전 관리자 권한 해제 통과
- 검증용 임시 계정과 장부는 검사 후 정리했습니다. 실제 학생 장부와 비밀번호는 검증 과정에서 변경하지 않았습니다.

## 재배포

배포용 웹앱 환경 변수는 git 제외 파일 `.env.production.local`에 있습니다. 개발 서버 localhost의 로컬 저장 모드와 실제 배포 저장소는 서로 별개입니다.

```powershell
firebase.cmd deploy --only firestore,functions,hosting --project money-clover --non-interactive
```

Hosting 배포 전 실제 프로젝트 환경 변수를 검사하고 빌드하도록 설정했습니다. 관리자 암호를 초기화할 때는 `scripts/provision-admin.mjs`에 `--pin=새숫자4자리 --reset`을 전달합니다. 이 작업은 기존 관리자 세션의 권한을 무효화합니다. 학생 명단 재등록은 `node scripts/import-students.mjs studentlist.csv --project=money-clover --apply --firebase-cli`를 사용하며, 학생이 변경한 기존 비밀번호는 보존합니다.
