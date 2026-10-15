import Image from 'next/image';
import { ILLUSTRATIONS, pngSrc, type IllustrationId } from './registry';
import { cx } from '../ui/cx';

export interface IllustrationProps {
  id: IllustrationId;
  /** Rendered edge length in px. Assets are square (600x600) so proportions are always preserved. */
  size?: number;
  /** Accessible description. Pass '' when the meaning is already stated in text next to it. */
  alt?: string;
  className?: string;
  /** Dim and desaturate: data is missing, so the picture must not read as a live state. */
  muted?: boolean;
}

/** The single way a static PNG illustration is rendered: transparent, square, never stretched, shrinks with its container. */
export function Illustration({ id, size = 96, alt, className, muted }: IllustrationProps) {
  const text = alt ?? ILLUSTRATIONS[id];
  return (
    <Image
      src={pngSrc(id)} alt={text} width={size} height={size} sizes={`${size}px`}
      className={cx('aq-illustration h-auto max-w-full shrink-0 select-none object-contain', muted && 'opacity-60 grayscale', className)}
      style={{ width: size }} draggable={false}
    />
  );
}
