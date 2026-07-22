/** Exact easeInOutQuad — the same curve the hand-rolled scroll director used, so
 *  the Motion `useTransform` scrub stays 1:1 with the previous rAF implementation
 *  (Motion's named "easeInOut" is a cubic power curve and would NOT match). */
export const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
