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
import { ListadoConsultasPage } from './pages/ListadoConsultasPage.jsx';
import { DetalleConsultaPage } from './pages/DetalleConsultaPage.jsx';
import { AbrirConsultaPage } from './pages/AbrirConsultaPage.jsx';
import { AtencionConsultaPage } from './pages/AtencionConsultaPage.jsx';

import './styles/theme.css';
import './styles/components.css';

export function AppContent() {
  const [activeTab, setActiveTab] = useState('consulta');
  const [historiaAEditarId, setHistoriaAEditarId] = useState('');
  const [historiaGestionId, setHistoriaGestionId] = useState('');
  const [gestionSubtab, setGestionSubtab] = useState('alergias');

  // Estados de navegación para Consultas Odontológicas
  const [consultasHistoriaId, setConsultasHistoriaId] = useState('');
  const [abrirHistoriaId, setAbrirHistoriaId] = useState('');
  const [abrirPacienteId, setAbrirPacienteId] = useState('');
  const [detalleConsultaId, setDetalleConsultaId] = useState('');
  const [atencionConsultaId, setAtencionConsultaId] = useState('');

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

  const handleVerConsultasDeHistoria = (hId) => {
    setConsultasHistoriaId(hId);
    setActiveTab('consultas');
  };

  const handleAbrirConsulta = (hId = '', pacId = '') => {
    setAbrirHistoriaId(hId);
    setAbrirPacienteId(pacId);
    setActiveTab('abrir-consulta');
  };

  const handleVerDetalleConsulta = (consId) => {
    setDetalleConsultaId(consId);
    setActiveTab('detalle-consulta');
  };

  const handleEditarAtencion = (consId) => {
    setAtencionConsultaId(consId);
    setActiveTab('atencion-consulta');
  };

  const handleConsultaCreada = (consId, hId) => {
    setDetalleConsultaId(consId);
    if (hId) setConsultasHistoriaId(hId);
    setActiveTab('detalle-consulta');
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
            onVerConsultas={handleVerConsultasDeHistoria}
            onAbrirConsulta={handleAbrirConsulta}
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

        {activeTab === 'consultas' && (
          <ListadoConsultasPage
            key={consultasHistoriaId || 'consultas-default'}
            initialHistoriaId={consultasHistoriaId}
            onVerDetalle={handleVerDetalleConsulta}
            onAbrirConsulta={handleAbrirConsulta}
            onEditarAtencion={handleEditarAtencion}
          />
        )}

        {activeTab === 'detalle-consulta' && (
          <DetalleConsultaPage
            key={detalleConsultaId || 'detalle-default'}
            initialConsultaId={detalleConsultaId}
            onVolver={() => setActiveTab('consultas')}
            onVerHistoria={(hId) => {
              setHistoriaAEditarId(hId);
              setActiveTab('consulta');
            }}
            onEditarAtencion={handleEditarAtencion}
          />
        )}

        {activeTab === 'atencion-consulta' && (
          <AtencionConsultaPage
            key={atencionConsultaId || 'atencion-default'}
            initialConsultaId={atencionConsultaId}
            onVolver={() => {
              if (atencionConsultaId) {
                setDetalleConsultaId(atencionConsultaId);
                setActiveTab('detalle-consulta');
              } else {
                setActiveTab('consultas');
              }
            }}
            onVerDetalle={(consId) => {
              setDetalleConsultaId(consId);
              setActiveTab('detalle-consulta');
            }}
          />
        )}

        {activeTab === 'abrir-consulta' && (
          <AbrirConsultaPage
            key={`${abrirHistoriaId}-${abrirPacienteId}`}
            initialHistoriaId={abrirHistoriaId}
            initialPacienteId={abrirPacienteId}
            onConsultaCreada={handleConsultaCreada}
            onCancelar={() => setActiveTab('consultas')}
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