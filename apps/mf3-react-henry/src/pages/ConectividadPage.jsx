import { useHealthCheck } from '../hooks/useHealthCheck.js';
import { Card } from '../components/common/Card.jsx';
import { Button } from '../components/common/Button.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { Alert } from '../components/common/Alert.jsx';
import { Spinner } from '../components/common/Spinner.jsx';

export function ConectividadPage() {
  const { health, loading, error, lastChecked, checkHealth } = useHealthCheck(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card
        title="Diagnóstico de Infraestructura y Conectividad"
        action={
          <Button onClick={checkHealth} loading={loading} variant="secondary">
            Recomprobar Conexión
          </Button>
        }
      >
        <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--text-secondary)' }}>
          Esta pantalla valida la cadena completa de comunicación:
          <br />
          <code>Microfrontend React (Puerto 5173)</code> → <code>Vite Proxy</code> → <code>API Gateway Nginx (Puerto 80)</code> → <code>MS2 Expediente (NestJS :3001)</code> → <code>MongoDB (Puerto 27017)</code>.
        </p>

        {loading && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Spinner dark />
            <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Comprobando conexión con /api/expediente/health...
            </p>
          </div>
        )}

        {error && !loading && (
          <Alert
            title="Fallo de Conexión"
            detail={error.detail || error.message}
            status={error.status}
          />
        )}

        {health && !loading && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
                marginBottom: '24px',
              }}
            >
              {/* Microservicio */}
              <div
                style={{
                  background: 'var(--neutral-50)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Microservicio MS2
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>{health.service}</span>
                  <Badge variant={health.status === 'ok' ? 'activa' : 'cerrada'}>
                    {health.status}
                  </Badge>
                </div>
              </div>

              {/* Base de Datos */}
              <div
                style={{
                  background: 'var(--neutral-50)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Base de Datos MongoDB
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>clinica-dentalDB</span>
                  <Badge variant={health.database === 'connected' ? 'activa' : 'grave'}>
                    {health.database}
                  </Badge>
                </div>
              </div>

              {/* Timestamp */}
              <div
                style={{
                  background: 'var(--neutral-50)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Hora Servidor
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>
                  {health.timestamp ? new Date(health.timestamp).toLocaleTimeString() : '—'}
                </div>
                {lastChecked && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Última comprobación: {lastChecked.toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: '14px', margin: '0 0 8px', color: 'var(--text-secondary)' }}>
                Respuesta Cruda JSON de <code>/api/expediente/health</code>:
              </h4>
              <pre
                style={{
                  background: 'var(--neutral-900)',
                  color: '#38bdf8',
                  padding: '14px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px',
                  overflowX: 'auto',
                  margin: 0,
                }}
              >
                {JSON.stringify(health, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
