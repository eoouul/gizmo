/*
  GIZMO 프로젝트 목록 — 여기만 고치면 홈 화면에 카드와 소식이 생깁니다.

  프로젝트 하나 = 아래 GIZMO_PROJECTS 배열의 항목 하나입니다.
    slug      영문 소문자 식별자. 소식에서 이 프로젝트를 가리킬 때 씁니다.
    name      카드 제목
    kind      종류. 게임 · 툴 · 에셋 · 게임잼 … 자유롭게
    status    기획 · 개발 중 · 출시 · 중단  ("개발 중"은 민트, "출시"는 흰색 표시)
    featured  true 면 목록 맨 위에 가로로 크게 보입니다. 보통 하나만 켭니다.
    summary   한두 문장 소개
    tags      짧은 태그 목록
    engine / period / version   있으면 카드에 표시, 없으면 생략
    cover     "scene"(ROULETTE WARRIOR 타이틀 화면) / 이미지 경로 / 비우면 accent 색 무늬
    accent    cover 를 비웠을 때 쓸 색
    page      자세한 페이지 경로. 없으면 카드 제목에 링크가 안 걸립니다.
    links     [{ label, href }]  itch.io, 영상, 저장소 등 바깥 링크도 됩니다.
    placeholder  true 면 "준비 중" 임시 항목으로 점선 카드에 표시됩니다.
                 실제 내용을 채우면 이 줄을 지우세요.

  소식은 GIZMO_NEWS 에 { date, project(slug), title, href } 로 넣습니다.
  날짜 최신순으로 8개까지 홈에 나옵니다.
*/
window.GIZMO_PROJECTS = [
  {
    slug: "roulette-warrior",
    name: "ROULETTE WARRIOR",
    kind: "게임",
    status: "개발 중",
    featured: true,
    summary: "룰렛으로 장비를 뽑고 던전에서 살아남는 픽셀 액션 로그라이크. 그린우드 마을에 약 스무 번째로 소환된 용사 김의 이야기입니다.",
    tags: ["픽셀", "로그라이크", "액션"],
    engine: "Godot 4.6 · C#",
    period: "2026.04 –",
    version: "v0.1.9-a",
    cover: "scene",
    page: "projects/roulette-warrior/",
    links: [
      { label: "프로젝트 페이지", href: "projects/roulette-warrior/" },
      { label: "패치 노트", href: "projects/roulette-warrior/#devlog" },
      { label: "스크린샷", href: "projects/roulette-warrior/#shots" }
    ]
  },
  {
    // 임시 항목 — 실제 프로젝트로 바꿀 때 이름·소개를 채우고 placeholder 를 지우세요.
    slug: "project-02",
    name: "PROJECT 02",
    kind: "게임",
    status: "기획",
    placeholder: true,
    summary: "새 프로젝트를 준비하고 있습니다. 이름과 소개는 곧 올릴게요.",
    accent: "#FCB13B"
  },
  {
    // 임시 항목 — 실제 프로젝트로 바꿀 때 이름·소개를 채우고 placeholder 를 지우세요.
    slug: "project-03",
    name: "PROJECT 03",
    kind: "게임",
    status: "기획",
    placeholder: true,
    summary: "새 프로젝트를 준비하고 있습니다. 이름과 소개는 곧 올릴게요.",
    accent: "#F07EA0"
  }
];

window.GIZMO_NEWS = [
  { date: "2026-09-12", project: "roulette-warrior", title: "다음 빌드: 배당코인 도입, 자판기 결제를 배당코인으로", href: "projects/roulette-warrior/#devlog" },
  { date: "2026-09-10", project: "roulette-warrior", title: "v0.1.9-a 액세서리 보상 상자 위치 조정", href: "projects/roulette-warrior/#devlog" },
  { date: "2026-09-10", project: "roulette-warrior", title: "v0.1.7-a Brown 3구역 포탈이 상자를 가리던 문제 수정", href: "projects/roulette-warrior/#devlog" },
  { date: "2026-09-10", project: "roulette-warrior", title: "v0.1.4-a 전투 시작 시점 수정", href: "projects/roulette-warrior/#devlog" },
  { date: "2026-09-09", project: "roulette-warrior", title: "v0.1.0-a 첫 알파 빌드", href: "projects/roulette-warrior/#devlog" }
];
