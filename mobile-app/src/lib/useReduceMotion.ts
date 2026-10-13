// Tracks the system "reduce motion" setting so non-essential animation can be turned off. Defaults to false if the platform cannot tell.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    if (typeof AccessibilityInfo.isReduceMotionEnabled === 'function') {
      // Only a "true" answer needs state: the default is already false, so an unchanged answer causes no re-render.
      AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (active && v) setReduce(true); }).catch(() => {});
    }
    const sub = typeof AccessibilityInfo.addEventListener === 'function'
      ? AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => setReduce(v))
      : null;
    return () => { active = false; sub?.remove(); };
  }, []);
  return reduce;
}
