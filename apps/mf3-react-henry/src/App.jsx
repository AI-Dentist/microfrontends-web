import { useState } from 'react';
import { DevAuthProvider } from './context/DevAuthContext.jsx';
import { Header } from './components/layout/Header.jsx';
import { Navigation } from './components/layout/Navigation.jsx';
import { Footer } from './components/layout/Footer.jsx';
import { ConsultaHistoriaPage } from './pages/ConsultaHistoriaPage.jsx';
import { CrearHistoriaPage } from './pages/CrearHistoriaPage.jsx';
import { ActualizarAntecedentesPage } from './pages/ActualizarAntecedentesPage.jsx';
import { ConectividadPage } from './pages/ConectividadPage.jsx';
import { GestionClinicaPage } from './pages/GestionClinicaPage.jsx';

import './styles/theme.css';
import './styles/components.css';

export function AppContent() {
  const [activeTab, setActiveTab] = useState('consulta');
  const [historiaAEditarId, setHistoriaAEditarId] = useState('');
  const [historiaGestionId, setHistoriaGestionId] = useState('');
  const [gestionSubtab, setGestionSubtab] = useState('alergias');

  const handleEditarAntecedentes = (id) => {
    setHistoriaAEditarId(id);
    setActiveTab('actualizar');
  };

  const handleVerHistoriaCreada = (id) => {
    setHistoriaAEditarId(id);
    setActiveTab('consulta');
  };

  const handleGestionarClinica = (id, subtab = 'alergias') => {
    setHistoriaGestionId(id);
    setGestionSubtab(subtab);
    setActiveTab('gestion');
  };

  return (
    <div className="app-container">
      <Header />
      <main className="main-content">
        <Navigation activeTab={activeTab} onSelectTab={setActiveTab} />

        {activeTab === 'consulta' && (
          <ConsultaHistoriaPage
            onEditarAntecedentes={handleEditarAntecedentes}
            onGestionarClinica={handleGestionarClinica}
          />
        )}

        {activeTab === 'crear' && (
          <CrearHistoriaPage onVerHistoria={handleVerHistoriaCreada} />
        )}

        {activeTab === 'actualizar' && (
          <ActualizarAntecedentesPage initialHistoriaId={historiaAEditarId} />
        )}

        {activeTab === 'gestion' && (
          <GestionClinicaPage
            key={`${historiaGestionId}-${gestionSubtab}`}
            initialHistoriaId={historiaGestionId}
            initialSubtab={gestionSubtab}
          />
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