import { useState } from 'react';
import { tabFromContext, navigateTab } from './remote-session.js';
import { DevAuthProvider } from './context/DevAuthContext.jsx';
import { Header } from './components/layout/Header.jsx';
import { Navigation } from './components/layout/Navigation.jsx';
import { Footer } from './components/layout/Footer.jsx';
import { ConsultaHistoriaPage } from './pages/ConsultaHistoriaPage.jsx';
import { CrearHistoriaPage } from './pages/CrearHistoriaPage.jsx';
import { ActualizarAntecedentesPage } from './pages/ActualizarAntecedentesPage.jsx';
import { ConectividadPage } from './pages/ConectividadPage.jsx';

import './styles/theme.css';
import './styles/components.css';

export function AppContent({ remoteContext }) {
  const [localTab, setLocalTab] = useState('consulta');
  const activeTab = remoteContext ? tabFromContext(remoteContext) : localTab;
  const selectTab = (tab) => {
    if (remoteContext) navigateTab(remoteContext, tab);
    else setLocalTab(tab);
  };
  const [historiaAEditarId, setHistoriaAEditarId] = useState('');

  const handleEditarAntecedentes = (id) => {
    setHistoriaAEditarId(id);
    selectTab('actualizar');
  };

  const handleVerHistoriaCreada = (id) => {
    setHistoriaAEditarId(id);
    selectTab('consulta');
  };

  return (
    <div className="app-container">
      <Header />
      <main className="main-content">
        <Navigation activeTab={activeTab} onSelectTab={selectTab} />

        {activeTab === 'consulta' && (
          <ConsultaHistoriaPage onEditarAntecedentes={handleEditarAntecedentes} />
        )}

        {activeTab === 'crear' && (
          <CrearHistoriaPage onVerHistoria={handleVerHistoriaCreada} />
        )}

        {activeTab === 'actualizar' && (
          <ActualizarAntecedentesPage initialHistoriaId={historiaAEditarId} />
        )}

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