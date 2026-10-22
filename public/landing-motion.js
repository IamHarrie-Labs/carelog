// Marketing demonstrations only. Care records inside the app never move for decoration.
export function installLandingMotion(root) {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  let observer;
  let phaseObserver;
  let storyObserver;
  const animate = (element, frames, options) => {
    if (!element || media.matches) return;
    const animation = element.animate(frames, options);
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation)).catch(() => animations.delete(animation));
  };
  const ease = 'cubic-bezier(0.23,1,0.32,1)';
  const hero = root.querySelector('.cl-hero');
  const play = () => {
    if (media.matches) return;
    animations.forEach(animation => { if (animation.effect?.target?.closest('.cl-story')) animation.cancel(); });
    root.querySelectorAll('.cl-story').forEach(el => el.setAttribute('data-motion', 'playing'));
    root.querySelectorAll('.cl-line').forEach((el, i) => animate(el, [{ opacity: .25, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 650, delay: i * 300, easing: ease }));
    root.querySelectorAll('.cl-record').forEach((el, i) => animate(el, [{ opacity: .2, translate: '18px 0' }, { opacity: 1, translate: '0 0' }], { duration: 800, delay: 850 + i * 350, easing: ease }));
    root.querySelectorAll('.cl-wave i').forEach((el, i) => animate(el, [{ transform: 'scaleY(.45)' }, { transform: 'scaleY(1)' }, { transform: 'scaleY(.45)' }], { duration: 420, delay: i * 35, iterations: 3, easing: 'ease-in-out' }));
  };
  const replay = root.querySelector('[data-testid="replay-handoff"]');
  replay?.addEventListener('click', play);
  const setup = () => {
    observer?.disconnect(); phaseObserver?.disconnect(); storyObserver?.disconnect();
    animations.forEach(animation => animation.cancel()); animations.clear();
    if (media.matches) return;
    hero?.querySelectorAll(':scope > .cl-eyebrow, :scope > h1, :scope > .cl-button').forEach((el, i) => animate(el, [{ opacity: .2, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 700, delay: i * 90, easing: ease }));
    observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      animate(entry.target, [{ opacity: .2, transform: 'translateY(22px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 800, easing: ease });
      observer.unobserve(entry.target);
    }), { threshold: .15 });
    root.querySelectorAll('.cl-reveal').forEach(el => observer.observe(el));
    storyObserver = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { play(); storyObserver.unobserve(entry.target); } }), { threshold: .4 });
    const story = root.querySelector('.cl-story'); if (story) storyObserver.observe(story);
    phaseObserver = new IntersectionObserver(entries => {
      const active = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (active) root.querySelector('.cl-journey')?._showPhase(Number(active.target.dataset.phase));
    }, { rootMargin: '-20% 0px -30% 0px', threshold: [0, .3, .6] });
    root.querySelectorAll('.cl-journey-step').forEach(el => phaseObserver.observe(el));
  };
  setup();
  media.addEventListener('change', setup);
  return () => { observer?.disconnect(); phaseObserver?.disconnect(); storyObserver?.disconnect(); animations.forEach(animation => animation.cancel()); media.removeEventListener('change', setup); replay?.removeEventListener('click', play); };
}
