/*
  홈 배경: 픽셀 별이 반짝이고 가끔 유성이 떨어지는 밤하늘.
  산 능선 실루엣은 styles.css 의 .backdrop-ridge 가 그립니다.
  동작 줄이기 설정이면 별만 멈춘 채로 한 번 그립니다.
*/
(() => {
  const c = document.querySelector(".backdrop-stars");
  if (!c) return;
  const g = c.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const colors = ["#E8EDF8", "#E8EDF8", "#E8EDF8", "#E8EDF8", "#9AA9CC", "#3BF5A4", "#FCB13B"];
  let W = 0, H = 0, dpr = 1, stars = [], meteor = null, next = performance.now() + 2500;

  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = c.width = Math.round(innerWidth * dpr);
    H = c.height = Math.round(innerHeight * dpr);
    const px = Math.max(1, Math.round(dpr));
    stars = Array.from({ length: Math.round(innerWidth * innerHeight / 6500) }, () => ({
      x: Math.floor(Math.random() * W), y: Math.floor(Math.random() * H * 0.8),
      s: (Math.random() < 0.12 ? 2 : 1) * px, c: colors[Math.floor(Math.random() * colors.length)],
      p: Math.random() * 6.28, f: 0.5 + Math.random() * 1.8
    }));
  };

  const drawMeteor = (t) => {
    if (!meteor && t > next) meteor = { x: Math.random() * W * 0.7, y: Math.random() * H * 0.25, t0: t };
    if (!meteor) return;
    const k = (t - meteor.t0) / 900;
    if (k > 1) {
      meteor = null;
      next = t + 5000 + Math.random() * 7000;
      return;
    }
    const dx = Math.cos(0.6), dy = Math.sin(0.6), len = 150 * dpr;
    const hx = meteor.x + dx * k * 420 * dpr, hy = meteor.y + dy * k * 420 * dpr;
    const trail = g.createLinearGradient(hx - dx * len, hy - dy * len, hx, hy);
    trail.addColorStop(0, "rgba(232, 237, 248, 0)");
    trail.addColorStop(1, "rgba(232, 237, 248, 0.9)");
    g.globalAlpha = 1 - k * k;
    g.strokeStyle = trail;
    g.lineWidth = 2 * dpr;
    g.beginPath();
    g.moveTo(hx - dx * len, hy - dy * len);
    g.lineTo(hx, hy);
    g.stroke();
    g.fillStyle = "#FCB13B";
    g.fillRect(hx - 1.5 * dpr, hy - 1.5 * dpr, 3 * dpr, 3 * dpr);
  };

  const draw = (t) => {
    g.clearRect(0, 0, W, H);
    for (const s of stars) {
      g.globalAlpha = reduce ? 0.8 : 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t / 1000 * s.f + s.p));
      g.fillStyle = s.c;
      g.fillRect(s.x, s.y, s.s, s.s);
    }
    if (!reduce) drawMeteor(t);
    g.globalAlpha = 1;
  };

  addEventListener("resize", () => { resize(); if (reduce) draw(0); });
  resize();
  if (reduce) {
    draw(0);
    return;
  }
  const loop = (t) => {
    if (!document.hidden) draw(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
