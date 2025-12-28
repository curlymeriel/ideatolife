import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Suspense } from 'react';
import { MainLayout } from './components/Layout/MainLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { lazyImport } from './utils/lazyImport';

// Lazy load pages with auto-reload recovery
const Dashboard = lazyImport(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const Step1_Setup = lazyImport(() => import('./pages/Step1_Setup').then(module => ({ default: module.Step1_Setup })));
const Step2_Style = lazyImport(() => import('./pages/Step2_Style').then(module => ({ default: module.Step2_Style })));
const Step3_Production = lazyImport(() => import('./pages/Step3_Production').then(module => ({ default: module.Step3_Production })));
const Step4_QualityAssurance = lazyImport(() => import('./pages/Step4_QualityAssurance').then(module => ({ default: module.Step4_QualityAssurance })));
const Step4_5_VideoComposition = lazyImport(() => import('./pages/Step4_5_VideoComposition').then(module => ({ default: module.Step4_5_VideoComposition })));
const Step5_Thumbnail = lazyImport(() => import('./pages/Step5_Thumbnail').then(module => ({ default: module.Step5_Thumbnail })));
const Step6_Final = lazyImport(() => import('./pages/Step6_Final').then(module => ({ default: module.Step6_Final })));

const SharedView = lazyImport(() => import('./pages/SharedView').then(module => ({ default: module.SharedView })));


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
          <ErrorBoundary>
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                  <Route path="/step/1" element={<ErrorBoundary><Step1_Setup /></ErrorBoundary>} />
                  <Route path="/step/2" element={<ErrorBoundary><Step2_Style /></ErrorBoundary>} />
                  <Route path="/step/3" element={<ErrorBoundary><Step3_Production /></ErrorBoundary>} />
                  <Route path="/step/4" element={<ErrorBoundary><Step4_QualityAssurance /></ErrorBoundary>} />
                  <Route path="/step/4.5" element={<ErrorBoundary><Step4_5_VideoComposition /></ErrorBoundary>} />
                  <Route path="/step/5" element={<ErrorBoundary><Step5_Thumbnail /></ErrorBoundary>} />
                  <Route path="/step/6" element={<ErrorBoundary><Step6_Final /></ErrorBoundary>} />
                  <Route path="/share/:shareId" element={<ErrorBoundary><SharedView /></ErrorBoundary>} />
                </Routes>
              </Suspense>
            </MainLayout>
          </ErrorBoundary>
        } />
      </Routes>
    </Router>
  );
};

export default App;
