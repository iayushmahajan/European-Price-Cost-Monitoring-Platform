import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Shell from './price-cost/components/Shell';
import Landing from './price-cost/pages/Landing';
import './price-cost/styles.css';
import { CatalogueProvider } from './price-cost/catalogue';
const Overview = lazy(() => import('./price-cost/pages/Overview'));
const Explore = lazy(() => import('./price-cost/pages/Explore'));
const LegacyApp = lazy(() => import('./LegacyApp'));
export default function App() {
  const { pathname } = useLocation();
  if (['/overview','/explore','/analyst','/data'].includes(pathname)) return <Suspense fallback={<div role="status">Opening retail workspace…</div>}><LegacyApp/></Suspense>;
  return <Suspense fallback={<div role="status" className="pc-boot">Opening workspace…</div>}><Routes><Route element={<Shell/>}><Route path="/" element={<Landing/>}/><Route element={<CatalogueProvider><Outlet/></CatalogueProvider>}><Route path="/app/overview" element={<Overview/>}/><Route path="/app/explore" element={<Explore/>}/></Route><Route path="/app/analyst" element={<div className="pc-canvas pc-state"><h1>AI Analyst</h1></div>}/><Route path="/app/sources" element={<div className="pc-canvas pc-state"><h1>Data & Sources</h1></div>}/><Route path="*" element={<div className="pc-canvas pc-state"><h1>Page not found</h1><p>Choose a workspace from the navigation.</p></div>}/></Route><Route path="/legacy" element={<Navigate to="/overview" replace/>}/></Routes></Suspense>;
}
