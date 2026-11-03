export class ErpCatalogUnavailableError extends Error {
  constructor(message = 'ERP catalog host capability unavailable') {
    super(message);
    this.name = 'ErpCatalogUnavailableError';
  }
}

export class ErpCatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ErpCatalogError';
  }
}

// Field and operation names come from contracts/graphql/ms1-erp.graphql.
const QUERIES = {
  listarOdontologos: 'query { listarOdontologos(soloActivos: true) { id nombres apellidos matriculaProfesional } }',
  listarConsultorios: 'query { listarConsultorios { id codigo nombre estado } }',
  listarPacientes: 'query ($busqueda: String) { listarPacientes(busqueda: $busqueda) { id nombres apellidos ciNit } }',
};

const LABELS = {
  listarOdontologos: o => `${o.nombres} ${o.apellidos} (${o.matriculaProfesional})`,
  listarConsultorios: c => `${c.codigo} — ${c.nombre}`,
  listarPacientes: p => `${p.nombres} ${p.apellidos} (${p.ciNit})`,
};

// Hosted-only client for the ERP catalogs (canonical IDs). Same transport rules as
// the MS3 client: current token per request, null/revoked retires it for good, late
// results are discarded. A missing ERP URL only disables catalogs; nothing is guessed.
export function createErpCatalogService({ erpUrl, getAccessToken, hosted = true } = {}) {
  if (hosted && typeof getAccessToken !== 'function') throw new ErpCatalogUnavailableError();
  const configured = typeof erpUrl === 'string' && erpUrl !== '';
  let retired = false;
  function retire() { retired = true; }
  async function run(operation, variables) {
    if (retired) throw new ErpCatalogUnavailableError();
    if (!configured) throw new ErpCatalogUnavailableError('ERP catalog URL is not configured for this host');
    let token;
    try { token = getAccessToken(); } catch { token = null; }
    if (typeof token !== 'string' || !token) {
      retire();
      throw new ErpCatalogUnavailableError();
    }
    // The GraphQL endpoint is used verbatim: no path or query rewriting.
    const response = await fetch(erpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: QUERIES[operation], ...(variables ? { variables } : {}) }),
    });
    if (retired) throw new ErpCatalogUnavailableError();
    if (!response.ok) throw new ErpCatalogError(`ERP catalog request failed (HTTP ${response.status})`);
    const body = await response.json();
    if (retired) throw new ErpCatalogUnavailableError();
    if (body.errors?.length) throw new ErpCatalogError(body.errors[0].message || 'ERP catalog query failed');
    return (body.data?.[operation] ?? []).map(item => ({ id: item.id, label: LABELS[operation](item) }));
  }
  return {
    get retired() { return retired; },
    retire,
    listarOdontologos: () => run('listarOdontologos'),
    listarConsultorios: () => run('listarConsultorios'),
    listarPacientes: busqueda => run('listarPacientes', { busqueda: busqueda || null }),
  };
}
