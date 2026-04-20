// App.tsx — sets up routing for the whole app.
//
// HOW ROUTING WORKS:
// React Router watches the URL in the browser. When it changes,
// it swaps out the page component — no full page reload.
// BrowserRouter = uses real URLs like /news, /hydrology
// Routes = the list of URL → component mappings
// Route = one mapping: "when URL is /news, show <NewsPage />"

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard  from './pages/Dashboard'

// Pages — we'll create these one by one
// Importing lazily so each page only loads when visited (faster initial load)
import { lazy, Suspense } from 'react'
const NewsPage       = lazy(() => import('./pages/NewsPage'))
const HydrologyPage  = lazy(() => import('./pages/HydrologyPage'))
const AlertsPage     = lazy(() => import('./pages/AlertsPage'))
const StocksPage     = lazy(() => import('./pages/StocksPage'))
const MapPage        = lazy(() => import('./pages/MapPage'))

export default function App() {
  return (
    <BrowserRouter>
      {/*
        Suspense shows a fallback while a lazy page is loading.
        Once loaded it's cached — subsequent visits are instant.
      */}
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Default route — redirect / to /news */}
          <Route path="/"           element={<Navigate to="/news" replace />} />
          <Route path="/news"       element={<NewsPage />} />
          <Route path="/hydrology"  element={<HydrologyPage />} />
          <Route path="/alerts"     element={<AlertsPage />} />
          <Route path="/stocks"     element={<StocksPage />} />
          <Route path="/map"        element={<MapPage />} />
          <Route path="/dashboard"  element={<Dashboard />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

// Simple loading state shown while a page chunk is being fetched
function PageLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', color: 'var(--text-muted)', fontSize: 'var(--text-sm)'
    }}>
      Loading...
    </div>
  )
}
