type BrandProps = {
  href: string;
  footer?: boolean;
};

export function Brand({ href, footer = false }: BrandProps) {
  const className = footer ? "brand footer-brand" : "brand";

  return (
    <a className={className} href={href} aria-label="AgentAction home">
      <span className="brand-symbol" aria-hidden="true" />
      <span>AgentAction</span>
    </a>
  );
}
