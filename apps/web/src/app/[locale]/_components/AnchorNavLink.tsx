"use client";

import { usePathname } from "@/i18n/navigation";

interface AnchorNavLinkProps {
  hash: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Anchor navigation link that handles both:
 * - Same-page smooth scroll (when on landing page)
 * - Cross-page navigation (when on /pricing or other pages → navigate to /#hash)
 */
export function AnchorNavLink({ hash, children, className }: AnchorNavLinkProps) {
  const pathname = usePathname();
  const isLandingPage = pathname === "/" || pathname === "";

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isLandingPage) {
      // Same page: smooth scroll to section
      e.preventDefault();
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        // Update URL hash without triggering navigation
        window.history.pushState(null, "", `#${hash}`);
      }
    }
    // Cross-page: let the default <a href="/...#hash"> navigate
  };

  const href = isLandingPage ? `#${hash}` : `/#${hash}`;

  return (
    <a href={href} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
