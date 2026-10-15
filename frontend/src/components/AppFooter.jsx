import { BRAND, copyrightText } from "@/lib/brand";

export const AppFooter = ({ dark = false, className = "" }) => {
  const base = dark ? "text-white/45" : "text-muted2/80";
  const strong = dark ? "text-white/80" : "text-ink";
  return (
    <footer
      className={`print:hidden text-[11px] font-mono-data ${base} ${className}`}
      data-testid="app-footer"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
        <span data-testid="footer-developer">
          Design and Developed by : <span className={`font-semibold ${strong}`}>{BRAND.developer}</span>
        </span>
        <span aria-hidden>·</span>
        <span data-testid="footer-contact">
          Contact: <a href={`tel:${BRAND.contact}`} className={`font-semibold ${strong} hover:underline`}>{BRAND.contact}</a>
        </span>
        <span aria-hidden>·</span>
        <span data-testid="footer-copyright">{copyrightText()}</span>
      </div>
    </footer>
  );
};

export default AppFooter;
