export function startReferenceMotion(root) {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  const observers = [];
  const ease = 'cubic-bezier(.23,1,.32,1)';
  const animate = (el, frames, options) => {
    if (!el || media.matches) return;
    const animation = el.animate(frames, options);
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation)).catch(() => animations.delete(animation));
  };
  const play = () => {
    for (const animation of animations) if (animation.effect?.target?.closest('.ref-story')) animation.cancel();
    root.querySelectorAll('.cl-line').forEach((el, i) => animate(el, [{ opacity: .12, transform: 'translateY(9px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 800, delay: i * 430, easing: ease }));
    root.querySelectorAll('.cl-record').forEach((el, i) => animate(el, [{ opacity: .1, translate: '24px 0' }, { opacity: 1, translate: '0 0' }], { duration: 900, delay: 1100 + i * 400, easing: ease }));
    root.querySelectorAll('.ref-wave').forEach((el, i) => animate(el, [{ transform: 'scaleY(.4)' }, { transform: 'scaleY(1)' }, { transform: 'scaleY(.4)' }], { duration: 450, delay: i * 32, iterations: 4, easing: 'ease-in-out' }));
  };
  const replay = root.querySelector('[data-testid="replay-handoff"]');
  replay?.addEventListener('click', play);
  const reset = () => {
    observers.forEach(observer => observer.disconnect()); observers.length = 0;
    animations.forEach(animation => animation.cancel()); animations.clear();
    if (media.matches) return;
    root.querySelectorAll('.ref-hero > .ref-label, .ref-hero > h1, .ref-hero > .ref-primary').forEach((el, index) => animate(el, [{ opacity: .2, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 850, delay: index * 110, easing: ease }));
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      animate(entry.target, [{ opacity: .25, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 800, easing: ease });
      reveal.unobserve(entry.target);
    }), { threshold: .15 });
    root.querySelectorAll('.ref-reveal').forEach(el => reveal.observe(el)); observers.push(reveal);
    const story = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { play(); story.unobserve(entry.target); } }), { threshold: .3 });
    const illustration = root.querySelector('.ref-story'); if (illustration) story.observe(illustration); observers.push(story);
    const phases = new IntersectionObserver(entries => {
      if (innerWidth <= 760) return;
      const active = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (active) root.querySelector('.ref-walkthrough')?._select(Number(active.target.dataset.scene));
    }, { rootMargin: '-25% 0px -30% 0px', threshold: [0, .2, .5] });
    root.querySelectorAll('.ref-scroll-track [data-scene]').forEach(el => phases.observe(el)); observers.push(phases);

  };
  reset();

  media.addEventListener('change', reset);
  return () => { observers.forEach(observer => observer.disconnect()); animations.forEach(animation => animation.cancel()); media.removeEventListener('change', reset); replay?.removeEventListener('click', play); };
}
