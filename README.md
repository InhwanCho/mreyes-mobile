# MReyes Mobile

기존 MReyes Next.js 웹을 표시하는 React Native 앱입니다. Expo는 RN의 프로젝트·네이티브 빌드 도구로 사용합니다. Android를 먼저 구현하고, 같은 소스로 iOS를 확장합니다.

## 구성

- `App.tsx`: WebView, Android 뒤로가기, 안전 영역, 오류·재시도, 외부 브라우저, 앱 복귀, 파일 저장·공유.
- `src/navigation.ts`: 웹 도메인·캘린더 URL·딥링크·공유 파일 검증.
- `src/web-bridge.ts`: 웹에서 앱으로 전달하는 제한된 메시지. 로그인 토큰은 전달하지 않습니다.
- `app.json`: 이름·아이콘·Android 패키지·iOS 번들 ID·권한.
- `android/`, `ios/`: Expo prebuild로 생성하는 네이티브 프로젝트. 생성물은 Git에서 제외합니다. 영구 설정은 app.json 또는 config plugin에 작성합니다.
- 기존 웹 코드는 `../web/frontend`, API는 `../web/backend`에 있습니다.

패키지 / 번들 ID: `net.pentaworks.mreyes`. 기존 TWA(`app.vercel.penta_works_web.twa`)와 별도 앱입니다. TWA 파일은 수정하지 않았습니다. 기존 TWA를 덮어쓰거나 기존 로그인 데이터를 가져오지 않습니다.

## 개발 실행

Node 22.13 이상과 JDK 17을 사용합니다.

```sh
nvm use
npm ci
cp .env.example .env
npm run check
npm run android
```

`.env`의 `EXPO_PUBLIC_APP_URL`에 HTTPS 웹 원본 주소를 설정합니다. 기본값은 `https://app.pentaworks.net`입니다. 이 값은 공개 설정이며 비밀값을 넣으면 안 됩니다. 개발 API는 기기에서 접근 가능한 HTTPS 도메인으로 설정합니다.

Android SDK는 `ANDROID_HOME`으로 지정합니다. 현재 Mac에는 `$HOME/.bubblewrap/android_sdk`가 있습니다. 새 React Native 빌드에 필요한 SDK/NDK는 기존 TWA 시절보다 최신 버전입니다.

`npm start`로 Metro를 실행할 수 있습니다. 외부 브라우저 → `mreyes://` 앱 복귀는 Expo Go가 아니라 빌드한 MReyes 앱에서 검증해야 합니다.

## 설치용 Android 테스트 APK

```sh
npm run android:preview
```

결과: `artifacts/mreyes-android-preview.apk`. ARM64 Android 7.0(API 24) 이상용이며 JS 번들이 포함되어 Metro 없이 실행됩니다. **테스트 서명키로 서명한 내부 확인용 APK입니다. Play Store 제출용이 아닙니다.** 공개 배포 전에는 전용 서명키/Play App Signing과 배포 채널을 설정합니다.

기존 TWA의 패키지와 서명키는 재사용하지 않습니다. 기존 TWA 설치 앱을 업데이트해야 한다면 배포 이력을 확인한 후 별도로 결정해야 합니다.

## 캘린더 연동

1. 앱 설정에서 전송 항목 안내에 동의.
2. 로그인된 웹 화면이 `POST /api/v1/integrations/google-calendar/mobile-ticket` 호출.
3. 서버가 2분 유효·일회용·캘린더 전용 티켓 발급. DB에는 SHA-256 해시만 저장.
4. 앱이 외부 브라우저의 `/api/v1/integrations/google-calendar/mobile/start#ticket=...` 열기.
5. 브라우저 페이지는 fragment를 즉시 지우고, 사용자가 계속 버튼을 누르면 `POST .../mobile/redeem` 호출.
6. 서버가 티켓 사용자·회사 활성 상태, 만료, 일회 사용을 확인하고 **이 브라우저에** OAuth 쿠키 설정.
7. 기존 Google OAuth와 서버 콜백에서 연동 완료. 완료 페이지의 버튼으로 `mreyes://calendar/complete` 열기.
8. 앱 복귀 시 서버의 연동 상태 재조회. 딥링크 내용으로 연동 성공을 판정하지 않음.

외부 브라우저에 다른 MReyes 계정으로 로그인되어 있어도 연결 계정은 앱에서 발급한 티켓으로 결정합니다. 브라우저의 MReyes 일반 로그인 세션은 생성·변경하지 않습니다. Google 계정 선택/승인은 사용자가 진행합니다. Google 캘린더 토큰은 기존처럼 서버에만 저장됩니다.

일반 웹/PWA의 기존 연동 흐름은 유지됩니다. 앱에서는 PWA 서비스워커를 새로 등록하지 않습니다.

## 웹/API 적용 순서

- 백엔드 Flyway `V59__calendar_mobile_ticket.sql`과 새 mobile API·HTML 페이지를 먼저 적용합니다.
- 프런트엔드의 native-app helper, 캘린더 버튼·앱 복귀 처리, 사업자등록증 공유 처리를 함께 적용합니다.
- 이후 새 앱의 전체 연동을 실제 Google 계정으로 확인합니다.
- 코드 작성만으로 운영 서버에 자동 반영되지는 않습니다. 운영 적용 전 앱에서는 기존 웹 기능을 이용할 수 있고, 캘린더 연결 시 외부 웹 로그인 안내로 대체됩니다.
- 기존 Google 웹 서버 콜백 주소를 유지합니다. 앱 자체가 Google 토큰을 받는 네이티브 OAuth로 전환할 때는 플랫폼별 OAuth 클라이언트를 별도로 설계합니다.

## 검증

```sh
npm run check
npm run bundle:android
```

웹: `node --test tests/native-app.test.mjs tests/pwa-update.test.mjs`, `tsc --noEmit`.

API: `./gradlew test --tests '*GoogleCalendarControllerTest' --tests '*SecurityTest'`.

실제 DB 경합/만료 테스트는 별도 폐기용 MariaDB의 `CALENDAR_MOBILE_TEST_DB_URL=jdbc:mariadb://127.0.0.1:13427/mreyes_mobile_qa`에서 `CalendarMobileDatabaseTest` 실행. 이 테스트는 **해당 QA DB의 테이블을 다시 생성**합니다. 운영 DB에 연결하지 않습니다.

기기에서 남은 확인:

- 로그인 후 앱 종료/재실행, 로그아웃, 네트워크 단절·복구.
- Android 뒤로가기, 키보드와 입력 폼, 화면 회전.
- 사진 선택·촬영 업로드, 사진 확대·공유, 사업자등록증 PDF 저장.
- Google 연결 성공·취소·티켓 만료·브라우저 다른 계정, 앱 자동/수동 복귀와 강제 종료 후 복귀.
- PDF/PNG/JPEG/WebP/CSV/XLSX 공유는 최대 15MB. 임시 캐시 파일은 공유 후 삭제합니다.

## 이후 범위

푸시 알림, Android App Links/iOS Universal Links, 스토어 제출, iOS 실제 기기 검증은 이후 단계입니다. 현재는 캘린더 복귀용 커스텀 스킴만 등록되어 있으며, 일반 업무 HTTPS 링크는 계속 웹으로 열립니다. iOS용 식별자·권한 설명은 준비했지만 iOS 바이너리는 아직 검증하지 않았습니다.
