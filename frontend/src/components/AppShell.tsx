import { useState, type ReactNode } from "react";
import { BarChart3, Bot, Compass, Database, Menu } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Button } from "./ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "./ui/sheet";
import { cn } from "../lib/utils";
import { ProductMark } from "./ProductMark";

const navigation = [
  { to: "/overview", label: "Overview", icon: BarChart3 },
  { to: "/explore", label: "Explore markets", icon: Compass },
  { to: "/analyst", label: "AI analyst", icon: Bot },
  { to: "/data", label: "Data & sources", icon: Database },
] as const;

function Navigation({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  return (
    <nav className={cn("top-navigation", mobile && "mobile-navigation")} aria-label="Primary navigation">
      {navigation.map(({ to, label, icon: Icon }) => {
        const link = <NavLink to={to} onClick={onNavigate} className={({ isActive }) => cn("top-nav-link", isActive && "is-active")}><Icon aria-hidden="true" /><span>{label}</span></NavLink>;
        return mobile ? <SheetClose asChild key={to}>{link}</SheetClose> : <span key={to}>{link}</span>;
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const current = navigation.find((item) => location.pathname.startsWith(item.to)) ?? navigation[0];
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="global-header">
        <div className="global-header-inner">
          <NavLink className="brand-lockup" to="/overview" aria-label="European Retail Intelligence home">
            <span className="brand-mark" aria-hidden="true"><ProductMark /></span>
            <span className="brand-name">European Retail <strong>Intelligence</strong></span>
          </NavLink>
          <Navigation />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild><Button className="mobile-menu-button" variant="ghost" size="icon" aria-label="Open navigation"><Menu /></Button></SheetTrigger>
            <SheetContent side="right" className="mobile-menu-sheet">
              <div className="mobile-menu-heading"><span className="brand-mark" aria-hidden="true"><ProductMark /></span><div><SheetTitle>European Retail Intelligence</SheetTitle><SheetDescription>{current.label}</SheetDescription></div></div>
              <Navigation mobile onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main id="main-content" className="app-main" tabIndex={-1}>{children}</main>
    </>
  );
}
