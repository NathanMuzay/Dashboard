import { useLayoutEffect, useRef } from 'react';

// Mesures du cadre, indépendantes du contenu et du nombre de colonnes affichées.
const BREAKPOINTS = { narrow: 300, tiny: 180, short: 240, flat: 160 };

export default function useWidgetSize() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      element.dataset.width = width < BREAKPOINTS.tiny ? 'tiny' : width < BREAKPOINTS.narrow ? 'narrow' : 'wide';
      element.dataset.height = height < BREAKPOINTS.flat ? 'flat' : height < BREAKPOINTS.short ? 'short' : 'tall';
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element, { box: 'border-box' });
    return () => observer.disconnect();
  }, []);
  return ref;
}
