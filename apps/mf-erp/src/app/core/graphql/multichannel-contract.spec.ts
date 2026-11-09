import { print } from 'graphql';
import { EJECUTAR_AGENTE_ERP } from './mutations.graphql';
import { LISTAR_HISTORIAL_AGENTE } from './queries.graphql';
it('selects the exact additive multichannel response on execution and history', () => {
  for (const doc of [EJECUTAR_AGENTE_ERP, LISTAR_HISTORIAL_AGENTE]) {
    const source = print(doc);
    expect(source).toMatch(/notificacionMulticanal\s*\{\s*exito\s+modoEjecucion\s+resultadosPorCanal\s*\{\s*canal\s+proveedor\s+estado\s+destino\s*\}/);
    expect(source).toContain('notificacionN8nEnviada');
  }
});
