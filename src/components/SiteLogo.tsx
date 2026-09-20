import { SITE } from '../site';

interface Props {
  size?: number;
  className?: string;
}

/** The real AURORA mark (chrome "A"), shared with the author's other projects. */
export default function SiteLogo({ size = 30, className }: Props) {
  return (
    <img
      src={SITE.logoSrc}
      alt="AURORA logo"
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ filter: 'drop-shadow(0 0 6px rgba(47,125,246,0.45))' }}
    />
  );
}
