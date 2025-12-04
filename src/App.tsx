import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { MainLayout } from './components/Layout/MainLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';

// Lazy load pages
const Dashboard = lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const Step1_Setup = lazy(() => import('./pages/Step1_Setup').then(module => ({ default: module.Step1_Setup })));
const Step2_Style = lazy(() => import('./pages/Step2_Style').then(module => ({ default: module.Step2_Style })));
const Step3_Thumbnail = lazy(() => import('./pages/Step3_Thumbnail').then(module => ({ default: module.Step3_Thumbnail })));

const Step4_Production = lazy(() => import('./pages/Step4_Production').then(module => ({ default: module.Step4_Production })));
const Step5_QualityAssurance = lazy(() => import('./pages/Step5_QualityAssurance').then(module => ({ default: module.Step5_QualityAssurance })));
const Step6_Final = lazy(() => import('./pages/Step6_Final').then(module => ({ default: module.Step6_Final })));
const SharedView = lazy(() => import('./pages/SharedView').then(module => ({ default: module.SharedView })));


const PageLoader = () => (
  <div className="flex items-center justify-center h-screen w-full bg-[var(--color-bg)]">
    <Loader2 className="animate-spin text-[var(--color-primary)]" size={48} />
  </div>
);

export const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/*" element={
          <MainLayout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                <Route path="/step/1" element={<ErrorBoundary><Step1_Setup /></ErrorBoundary>} />
                <Route path="/step/2" element={<ErrorBoundary><Step2_Style /></ErrorBoundary>} />
                <Route path="/step/3" element={<ErrorBoundary><Step4_Production /></ErrorBoundary>} />
                <Route path="/step/4" element={<ErrorBoundary><Step5_QualityAssurance /></ErrorBoundary>} />
                <Route path="/step/5" element={<ErrorBoundary><Step3_Thumbnail /></ErrorBoundary>} />
                <Route path="/step/6" element={<ErrorBoundary><Step6_Final /></ErrorBoundary>} />
                <Route path="/share/:shareId" element={<ErrorBoundary><SharedView /></ErrorBoundary>} />
              </Routes>
            </Suspense>
          </MainLayout>
        } />
      </Routes>
    </Router>
  );
};

export default App;
