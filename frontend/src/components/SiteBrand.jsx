import { isWinterTheme } from '../theme';

export function SiteBrand({ src, alt = '', className }) {
  if (!isWinterTheme) {
    return <img className={className} src={src} alt={alt} draggable={false} />;
  }

  return (
    <span className={className ? `winter-brand ${className}` : 'winter-brand'}>
      <img src={src} alt={alt} draggable={false} />
      <span className="winter-hat" aria-hidden="true" />
    </span>
  );
}

export function MenuBrand({ src }) {
  return isWinterTheme ? (
    <SiteBrand className="menu-winter-brand" src={src} alt="SPACE ARENA" />
  ) : (
    <p className="eb" style={{ justifyContent: 'center' }}>
      SPACE ARENA
    </p>
  );
}
