import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Shell from './price-cost/components/Shell';
import Landing from './price-cost/pages/Landing';
import './price-cost/styles.css';
const LegacyApp = lazy(() => import('./LegacyApp'));
export default function App() {
  return <Suspense fallback={<div role="status" className="pc-boot">Opening workspace…</div>}><Routes><Route element={<Shell/>}><Route path="/" element={<Landing/>}/><Route path="/app/overview" element={<div className="pc-canvas pc-state"><h1>Overview</h1><p>Price & cost workspace</p></div>}/><Route path="/app/explore" element={<div className="pc-canvas pc-state"><h1>Explore</h1></div>}/><Route path="/app/analyst" element={<div className="pc-canvas pc-state"><h1>AI Analyst</h1></div>}/><Route path="/app/sources" element={<div className="pc-canvas pc-state"><h1>Data & Sources</h1></div>}/><Route path="*" element={<div className="pc-canvas pc-state"><h1>Page not found</h1><p>Choose a workspace from the navigation.</p></div>}/></Route>{['overview','explore','analyst','data'].map(path => <Route key={path} path={'/'+path} element={<LegacyApp/>}/>)}<Route path="/legacy" element={<Navigate to="/overview" replace/>}/></Routes></Suspense>;
}
