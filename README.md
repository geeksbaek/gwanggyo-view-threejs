# 광교 새 집 투어 (three.js 웹 버전)

광교 자연앤 센트레빌 1703동 1702호 조망 투어, 아티팩트 v26과 같은 소스. three.js r169.

## 바로 열기

`fetch`로 데이터를 읽으므로 파일을 더블클릭하면 안 열리고, 이 폴더에서 웹 서버를 띄워야 한다.

```bash
cd gwanggyo-view-threejs
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000/index.html
```

three.js는 jsDelivr CDN에서 받으므로 인터넷이 필요하다.

## 파일

- `index.html` 단독 실행용 (아래 `gwanggyo-view.html`에 html/head를 씌운 것)
- `gwanggyo-view.html` 아티팩트에 올린 본문 (`python3 build.py`가 src/를 합쳐 만든다)
- `src/` 소스. 00_core 공통·데이터 로드, 10_sky 하늘·해·구름·날씨, 20_world 지형·건물·나무·물·차,
  30_home 집 안(벽·마감·문·조명), 40_post 후처리, 45_pick 주변 단지 이름표, 50_main 화면·조작·버튼, head.html UI
- `world.wasm` 지형·건물·나무·도로 데이터(이진 파일, 아티팩트가 .bin을 못 올려 이름만 .wasm), `world.json` 그 목록
- `sat_near.jpg`, `sat_far.jpg` 위성사진, `roadpaint.png` 도로 노면 표시
- `pipeline/` 데이터를 다시 만드는 스크립트 (OSM, DEM, 위성 타일, 동호수표 → world.*). 원본 내려받기는 다시 해야 함
- `shot.mjs` Playwright로 `?shot` 화면 캡처 (시험용)

## 다시 만들기

src/를 고친 뒤 `python3 build.py` → `gwanggyo-view.html`. `python3 build.py local`은 node_modules의 three를 쓰는 index.html을 만든다 (`npm i three@0.169.0` 필요).
