interface ConfettiParticle {
  x: number;
  y: number;
  r: number;
  d: number;
  color: string;
  tilt: number;
  tiltAngleIncremental: number;
  tiltAngle: number;
}

export function startConfettiAnimation(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  const resizeHandler = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resizeHandler);

  const colors = ['#ffd166', '#7bed9f', '#a68bd8', '#ff6b6b', '#4db8ff', '#ffffff'];
  const particles: ConfettiParticle[] = [];
  const maxParticles = 120;

  for (let i = 0; i < maxParticles; i += 1) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height - height,
      r: Math.random() * 6 + 4,
      d: Math.random() * 2 + 1,
      color: colors[i % colors.length],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: Math.random() * Math.PI,
    });
  }

  let animationId = 0;
  const draw = () => {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < maxParticles; i += 1) {
      const p = particles[i];
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
      p.x += Math.sin(p.tiltAngle) * 0.5;
      p.tilt = Math.sin(p.tiltAngle - i / 3) * 15;

      ctx.beginPath();
      ctx.lineWidth = p.r / 2;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx.stroke();

      if (p.y > height) {
        particles[i] = {
          x: Math.random() * width,
          y: -20,
          r: p.r,
          d: p.d,
          color: p.color,
          tilt: Math.random() * 10 - 5,
          tiltAngleIncremental: p.tiltAngleIncremental,
          tiltAngle: p.tiltAngle,
        };
      }
    }

    animationId = requestAnimationFrame(draw);
  };

  draw();

  return () => {
    cancelAnimationFrame(animationId);
    window.removeEventListener('resize', resizeHandler);
  };
}
