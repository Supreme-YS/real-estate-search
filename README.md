# 실거래 한눈에

국토교통부 실거래 신고 자료를 지역·부동산 유형·거래년월별로 조회하는 간단한 웹사이트입니다. [k-skill의 `real-estate-search` 스킬](https://github.com/NomaDamas/k-skill/tree/main/real-estate-search)에 문서화된 엔드포인트를 사용합니다.

## 실행

Node.js 20 이상이 필요합니다. 별도 패키지 설치나 개인 API 키는 필요하지 않습니다.

```powershell
cd C:\codeagent\real-estate-search
npm start
```

브라우저에서 `http://127.0.0.1:3000`을 여세요. 개발 중 파일 변경 시 자동 재시작하려면 `npm run dev`, 테스트는 `npm test`를 사용합니다.

## 주요 기능

- 시·군·구 자동완성 및 빠른 지역 선택
- 아파트·오피스텔·연립/다세대·단독/다가구의 매매/전월세, 상업/업무용 매매 조회
- 거래 건수, 중위/최저/최고 거래금액 또는 보증금/월세 요약
- 건물명·동 필터, 금액/최근순 정렬, 페이지 이동, 모바일 화면 지원
- 거래년월 기본값은 한국 시간 기준 전월입니다.

조회는 로컬 Node 서버가 `https://k-skill-proxy.nomadamas.org/v1/real-estate/`로 전달합니다. 브라우저의 교차 출처(CORS) 제한을 피하면서도 개인 API 키는 사용하지 않습니다. `KSKILL_PROXY_BASE_URL` 환경변수로 자체 호스팅한 프록시를 지정할 수 있습니다.

**유의:** 거래금액과 보증금은 원본의 **만원 단위**를 억/만 원으로 표시합니다. 한 번에 최대 1,000건을 불러오므로, 표시 건수가 1,000건이면 통계·건물명 필터는 불러온 거래에만 적용됩니다. 신고 자료는 정정되거나 늦게 반영될 수 있습니다. 공식 원본은 [국토교통부 실거래가 공개시스템](https://rt.molit.go.kr/)에서 확인할 수 있습니다.

## 외부 공개 (Render)

`render.yaml`에 무료 Render Web Service 배포 설정을 준비했습니다. 외부 공개에는 **GitHub 계정과 Render 계정 연결**이 필요합니다.

> **GitHub Pages만 켜서는 실거래 조회가 동작하지 않습니다.** GitHub Pages는 정적 파일만 제공하지만 이 사이트는 CORS 제한을 우회하는 `server.js`가 필요합니다. 아래 방식에서는 **코드는 내 GitHub 저장소**, **누구나 접속할 웹사이트는 Render의 공개 주소**에 배포됩니다.

1. 개인 GitHub에서 **새 저장소** `real-estate-search`를 만들고 공개 범위를 `Public`으로 설정하세요. 코드 공개를 원하지 않는다면 `Private` 저장소를 써도 Render에서 사이트를 공개할 수 있습니다.
2. 저장소의 **Add file → Upload files**에서 로컬 `real-estate-search` 폴더 **안의 내용만** 끌어다 저장소 최상단에 업로드하고 변경 사항을 커밋하세요. `render.yaml`, `package.json`, `server.js`, `public/`, `test/` 등이 최상단에 있어야 합니다. **`C:\codeagent` 전체를 공개 저장소에 올리지 마세요.**
3. Render 대시보드에서 GitHub 계정을 연결한 뒤 **New → Blueprint → 저장소 선택 → Deploy Blueprint**를 진행하세요. Render가 최상단의 `render.yaml`을 읽어 웹 서비스를 만듭니다.
4. 배포가 끝나면 Render가 제공하는 공개 주소를 열어 확인하세요. `https://<서비스 주소>/healthz`에서 `{"status":"ok"}`가 나오면 서버가 정상 동작하는 것입니다.

Render가 제공하는 `PORT`와 배포 설정의 `HOST=0.0.0.0`을 서버가 사용하므로, 별도 코드 수정이나 개인 API 키는 필요하지 않습니다. 무료 서비스는 일정 시간 접속이 없으면 종료되었다가 다음 접속에 다시 시작하므로 **처음 접속이 느릴 수 있습니다**. 공개 사용자가 많아진다면 유료 인스턴스와 API 호출량·프록시 이용 조건을 검토하세요.
