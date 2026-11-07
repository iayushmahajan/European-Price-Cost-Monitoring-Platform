import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, Database, Menu, SearchCode } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "./ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { cn } from "../lib/utils";

const navigation = [
  { id: "overview", label: "Market overview", description: "Performance and benchmarks", icon: BarChart3 },
  { id: "quality", label: "Data quality", description: "Coverage and provenance", icon: Database },
  { id: "analyst", label: "Data analyst", description: "Natural-language analysis", icon: SearchCode },
] as const;

function Navigation({ active, mobile = false }: { active: string; mobile?: boolean }) {
  return (
    <nav className="workspace-nav" aria-label="Workspace navigation">
      <p className="workspace-nav-label">Workspace</p>
      <div className="workspace-nav-list">
        {navigation.map((item) => {
          const Icon = item.icon;
          const link = (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn("workspace-nav-item", active === item.id && "is-active")}
              aria-current={active === item.id ? "location" : undefined}
            >
              <Icon aria-hidden="true" />
              <span className="workspace-nav-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
            </a>
          );
          if (mobile) return <SheetClose asChild key={item.id}>{link}</SheetClose>;
          return (
            <Tooltip key={item.id} delayDuration={500}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right" className="sidebar-tooltip">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [active, setActive] = useState("overview");
  const activeItem = navigation.find((item) => item.id === active) ?? navigation[0];

  useEffect(() => {
    const updateActiveSection = () => {
      const marker = window.scrollY + Math.min(180, window.innerHeight * 0.28);
      let current: (typeof navigation)[number]["id"] = navigation[0].id;
      for (const item of navigation) {
        const section = document.getElementById(item.id);
        if (section && section.offsetTop <= marker) current = item.id;
      }
      setActive(current);
    };
    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, []);

  return (
    <TooltipProvider>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="app-shell">
        <aside className="app-sidebar">
          <a className="brand-lockup" href="#overview">
            <span className="brand-symbol" aria-hidden="true">ER</span>
            <span className="brand-copy"><strong>European Retail</strong><small>Intelligence</small></span>
          </a>
          <Navigation active={active} />
          <div className="sidebar-context">
            <span className="status-dot" aria-hidden="true" />
            <div><strong>Eurostat workspace</strong><small>Official market data</small></div>
          </div>
        </aside>

        <main className="app-main" id="main-content">
          <header className="app-topbar">
            <div className="topbar-leading">
              <Sheet>
                <SheetTrigger asChild>
                  <Button className="mobile-menu-button" variant="ghost" size="icon" aria-label="Open navigation">
                    <Menu />
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <div className="mobile-sheet-brand">
                    <span className="brand-symbol" aria-hidden="true">ER</span>
                    <div><SheetTitle>European Retail Intelligence</SheetTitle><SheetDescription>Market intelligence workspace</SheetDescription></div>
                  </div>
                  <Navigation active={active} mobile />
                </SheetContent>
              </Sheet>
              <div className="topbar-location"><span>Workspace</span><strong>{activeItem.label}</strong></div>
            </div>
            <Badge variant="outline"><span className="status-dot" aria-hidden="true" /> Eurostat · EU-27</Badge>
          </header>
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}
