import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { ProductMark } from "../../components/ProductMark";
import { Panel } from "./Shared";
const links = [
  ["overview", "Overview"],
  ["explore", "Explore"],
  ["analyst", "AI Analyst"],
  ["sources", "Data & Sources"],
] as const;
export default function Shell() {
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const previous = useRef(location.pathname);
  useEffect(() => {
    const label =
      links.find(
        ([id]) => location.pathname.replace(/\/+$/, "") === "/app/" + id,
      )?.[1] || "Introduction";
    document.title = label + " · European Price & Cost Monitoring Platform";
  }, [location.pathname]);
  useEffect(() => {
    if (previous.current !== location.pathname) {
      main.current?.focus();
      window.scrollTo({ top: 0 });
      previous.current = location.pathname;
    }
  }, [location.pathname]);
  const landing = location.pathname === "/";
  const navigation = (
    <nav aria-label={menu ? "Mobile navigation" : "Primary navigation"}>
      {links.map(([path, label]) => (
        <NavLink key={path} to={"/app/" + path} onClick={() => setMenu(false)}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className={`pc-app${landing ? " pc-home-shell" : ""}`}>
      <a className="pc-skip" href="#pc-content">
        Skip to content
      </a>
      <header className="pc-header">
        <Link
          className="pc-brand"
          to="/"
          aria-label="European Price and Cost Monitoring Platform home"
        >
          <ProductMark />
          <span>
            European Price & Cost<strong>Monitoring Platform</strong>
          </span>
        </Link>
        {landing ? (
          <nav className="pc-landing-nav" aria-label="Introduction navigation">
            <Link to="/app/sources">Data & Sources</Link>
          </nav>
        ) : (
          <div className="pc-desktop-nav">{navigation}</div>
        )}
        <button
          className="pc-mobile-toggle pc-icon"
          aria-label="Open navigation"
          onClick={() => setMenu(true)}
        >
          <Menu />
        </button>
      </header>
      <main id="pc-content" className="pc-content" tabIndex={-1} ref={main}>
        <Suspense
          fallback={
            <div className="pc-state" role="status">
              Opening workspace…
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <footer className={`pc-footer${landing ? " pc-home-footer" : ""}`}>
        {landing ? (
          <>
            <nav className="pc-home-sources" aria-label="Official data sources">
              <a
                href="https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en"
                target="_blank"
                rel="noreferrer"
              >
                European Commission
              </a>
              <a
                href="https://ec.europa.eu/eurostat/web/hicp"
                target="_blank"
                rel="noreferrer"
              >
                Eurostat
              </a>
              <a
                href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html"
                target="_blank"
                rel="noreferrer"
              >
                European Central Bank
              </a>
            </nav>
            <Link to="/app/analyst">
              AI Analyst <span aria-hidden="true">↗</span>
            </Link>
          </>
        ) : (
          <>
            <span>Official European reference indicators</span>
            <div>
              <Link to="/">About the platform ↗</Link>
            </div>
          </>
        )}
      </footer>
      {menu && (
        <Panel
          title="Navigation"
          description="European Price & Cost Monitoring Platform"
          onClose={() => setMenu(false)}
          light={false}
        >
          <Link
            className="pc-mobile-home"
            to="/"
            onClick={() => setMenu(false)}
          >
            Introduction
          </Link>
          {navigation}
        </Panel>
      )}
    </div>
  );
}
