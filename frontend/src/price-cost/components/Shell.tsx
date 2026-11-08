import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { ProductMark } from '../../components/ProductMark';
import { Panel } from './Shared';
const links = [['overview','Overview'],['explore','Explore'],['analyst','AI Analyst'],['sources','Data & Sources']] as const;
export default function Shell() {
  const [menu, setMenu] = useState(false);
  const location = useLocation(); const main = useRef<HTMLElement>(null);
  const previous = useRef(location.pathname);
  useEffect(() => { if (previous.current !== location.pathname) { main.current?.focus(); window.scrollTo({ top: 0 }); previous.current = location.pathname; } }, [location.pathname]);
  const landing = location.pathname === '/';
  const navigation = <nav aria-label={menu ? 'Mobile navigation' : 'Primary navigation'}>{links.map(([path,label]) => <NavLink key={path} to={'/app/'+path} onClick={() => setMenu(false)}>{label}</NavLink>)}</nav>;
  return <div className="pc-app"><a className="pc-skip" href="#pc-content">Skip to content</a><header className="pc-header"><Link className="pc-brand" to="/" aria-label="European Price and Cost Monitoring Platform home"><ProductMark/><span>European Price & Cost<strong>Monitoring Platform</strong></span></Link>{landing ? <nav className="pc-landing-nav" aria-label="Introduction navigation"><Link to="/app/sources">Data & Sources</Link><Link to="/app/overview">Enter workspace ↗</Link></nav> : <div className="pc-desktop-nav">{navigation}</div>}<button className="pc-mobile-toggle pc-icon" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu/></button></header><main id="pc-content" className="pc-content" tabIndex={-1} ref={main}><Outlet/></main><footer className="pc-footer"><span>Official European reference indicators</span><div><Link to={landing ? '/app/overview' : '/'}>{landing ? 'Open workspace' : 'About the platform'} ↗</Link><Link to="/overview">Legacy retail</Link></div></footer>{menu && <Panel title="Navigation" description="European Price & Cost Monitoring Platform" onClose={() => setMenu(false)} light={false}><Link className="pc-mobile-home" to="/" onClick={() => setMenu(false)}>Introduction</Link>{navigation}</Panel>}</div>;
}
