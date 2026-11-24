// Разная фаза запуска распределяет снег по всему экрану уже при открытии страницы.
export const snowflakes = Array.from({ length: 42 }, (_, index) => {
  const depth = ((index * 23 + 11) % 43) / 42;
  const duration = 19 - depth * 8 + (index % 4);
  const phase = ((index * 19 + 13) % 43) / 43;

  return {
    left: `${((index * 17 + 7) % 43) * 3.15}%`,
    opacity: 0.24 + depth * 0.42,
    animationDuration: `${duration}s`,
    animationDelay: `-${duration * phase}s`,
    '--flake-size': 0.38 + depth * 0.69,
    '--flake-angle': `${(index * 43) % 180}deg`,
    '--flake-turn': `${index % 2 ? 70 : -100}deg`,
  };
});
