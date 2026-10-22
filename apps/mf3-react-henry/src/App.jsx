import { useState } from 'react';
import { DevAuthProvider } from './context/DevAuthContext.jsx';
import { Header } from './components/layout/Header.jsx';
import { Navigation } from './components/layout/Navigation.jsx';
import { Footer } from './components/layout/Footer.jsx';
import { ConsultaHistoriaPage } from './pages/ConsultaHistoriaPage.jsx';
import { ConectividadPage } from './pages/ConectividadPage.jsx';

import './styles/theme.css';
import './styles/components.css';

export function AppContent() {
  const [activeTab, setActiveTab] = useState('consulta');

  return (
    <div className="app-container">
      <Header />
      <main className="main-content">
        <Navigation activeTab={activeTab} onSelectTab={setActiveTab} />
        {activeTab === 'consulta' && <ConsultaHistoriaPage />}
        {activeTab === 'conectividad' && <ConectividadPage />}
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <DevAuthProvider>
      <AppContent />
    </DevAuthProvider>
  );
}