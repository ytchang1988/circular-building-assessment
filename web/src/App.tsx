import { Navigate, Route, Routes } from 'react-router-dom';
import { Header } from '@/components/Header';
import { ProjectMetaRoute } from '@/routes/ProjectMeta';
import { GroupRoute } from '@/routes/Group';
import { DashboardRoute } from '@/routes/Dashboard';

export default function App() {
  return (
    <div className="min-h-full">
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<ProjectMetaRoute />} />
          <Route path="/g" element={<Navigate to="/g/structure" replace />} />
          <Route path="/g/:group" element={<GroupRoute />} />
          <Route path="/g/:group/:cat" element={<GroupRoute />} />
          <Route path="/dashboard" element={<DashboardRoute />} />
          {/* Back-compat for old links */}
          <Route path="/rc" element={<Navigate to="/g/structure" replace />} />
          <Route path="/surface" element={<Navigate to="/g/envelope/cladding" replace />} />
        </Routes>
      </main>
    </div>
  );
}
