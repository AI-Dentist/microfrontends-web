<template>
  <div class="container">
    <header class="header">
      <h1>Microfrontend MF2 — Agenda, Horarios y Stock</h1>
      <p class="subtitle">Conectado a MS3 (Agenda y Stock)</p>
    </header>

    <!-- Navegación entre módulos -->
    <div class="tabs">
      <button :class="{ active: tab === 'citas' }" @click="selectTab('citas')">📅 Citas Agendadas</button>
      <button :class="{ active: tab === 'horarios' }" @click="selectTab('horarios')">⏰ Horarios Médicos</button>
      <button :class="{ active: tab === 'stock' }" @click="selectTab('stock')">📦 Inventario y Stock</button>
    </div>

    <main class="content">
      <div v-if="cargando" class="loading">Cargando datos desde MS3...</div>
      <div v-if="error" class="error">{{ error }}</div>

      <!-- TAB 1: CITAS (Listado + Formulario) -->
      <section v-if="tab === 'citas' && !cargando">
        <!-- Formulario de Agendamiento -->
        <div class="card form-card">
          <h3>Agendar Nueva Cita Médica</h3>
          <CitaForm :key="formVersion" :hosted="hosted" :catalogos="catalogos" :catalog-error="catalogError"
            :enviando="enviando || stockBusy" @guardar="guardarCita" @buscar-pacientes="buscarPacientes" />
          <p v-if="mensajeExito" class="success-msg">{{ mensajeExito }}</p>
        </div>

        <h3 class="section-title">Citas Registradas</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha y Hora</th>
              <th>Odontólogo</th>
              <th>Consultorio</th>
              <th>Paciente</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in citas" :key="c.id">
              <td><code>{{ c.id.substring(0, 8) }}...</code></td>
              <td>{{ c.fecha_hora }}</td>
              <td>{{ nombre('odontologos', c.odontologo_id) }}</td>
              <td>{{ nombre('consultorios', c.consultorio_id) }}</td>
              <td>{{ nombre('pacientes', c.paciente_id) }}</td>
              <td><span class="badge">{{ c.estado }}</span></td>
              <td>
                <CitaAcciones :cita="c" :stock="stock" :busy="enviando || stockBusy"
                  @cancelar="ejecutar(s => s.cancelarCita(c.id), 'Cita cancelada.')"
                  @no-asistio="ejecutar(s => s.noAsistio(c.id), 'Cita marcada como no asistió.')"
                  @reprogramar="fecha => ejecutar(s => s.reprogramarCita(c.id, toBackendDateTime(fecha)), 'Cita reprogramada.')"
                  @completar="datos => ejecutar(s => s.completarCita(c.id, datos), 'Cita completada.')" />
              </td>
            </tr>
            <tr v-if="citas.length === 0">
              <td colspan="7" class="text-center">No hay citas agendadas</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- TAB 2: HORARIOS -->
      <section v-if="tab === 'horarios' && !cargando">
        <h3 class="section-title">Disponibilidad de Odontólogos</h3>
        <div v-if="puedeEditarHorarios" class="card form-card">
          <h3>Crear horario (solo ADMIN)</h3>
          <HorarioForm :hosted="hosted" :catalogos="catalogos" :catalog-error="catalogError" :busy="enviando || stockBusy"
            @crear="horario => ejecutar(s => s.crearHorario(horario), 'Horario creado.')" />
          <p v-if="mensajeExito" class="success-msg">{{ mensajeExito }}</p>
        </div>
        <p v-else class="read-only">Los horarios son de solo lectura: crear o modificar horarios requiere el rol ADMIN.</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Odontólogo</th>
              <th>Especialidad</th>
              <th>Consultorio</th>
              <th>Fecha</th>
              <th>Horario</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in horarios" :key="h.id">
              <td>{{ h.id }}</td>
              <td>{{ nombre('odontologos', h.odontologo_id) }}</td>
              <td>{{ h.especialidad }}</td>
              <td>{{ nombre('consultorios', h.consultorio_id) }}</td>
              <td>{{ h.fecha }}</td>
              <td>{{ h.hora_inicio }} - {{ h.hora_fin }}</td>
              <td>
                <span :class="['badge', h.disponible ? 'disponible' : 'ocupado']">
                  {{ h.disponible ? 'Disponible' : 'Ocupado' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- TAB 3: STOCK -->
      <section v-if="tab === 'stock' && !cargando">
        <h3 class="section-title">Stock de Insumos Odontológicos</h3>
        <div class="card form-card">
          <h3>Registrar movimiento de stock</h3>
          <MovimientoForm :key="stockFormVersion" :stock="stock" :busy="enviando || stockBusy"
            @registrar="registrarMovimiento" />
          <p v-if="mensajeExito" class="success-msg">{{ mensajeExito }}</p>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Insumo</th>
              <th>Stock Actual</th>
              <th>Mínimo</th>
              <th>Unidad</th>
              <th>Alerta Reposición</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in stock" :key="item.id">
              <td>{{ item.codigo }}</td>
              <td>{{ item.nombre }}</td>
              <td><strong>{{ item.stock_actual }}</strong></td>
              <td>{{ item.stock_minimo }}</td>
              <td>{{ item.unidad_medida }}</td>
              <td>
                <span :class="['badge', item.alerta_reposicion ? 'alerta' : 'ok']">
                  {{ item.alerta_reposicion ? '⚠️ Reponer urgente' : 'OK' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { createMs3Service, createIntent, describeError, hasRole, listFrom, Ms3CapabilityError, toBackendDateTime } from './api/ms3Api.js';
import { createErpCatalogService } from './api/erpCatalogApi.js';
import { tabForContext, navigateTab } from './lifecycle.js';
import CitaForm from './components/CitaForm.vue';
import CitaAcciones from './components/CitaAcciones.vue';
import HorarioForm from './components/HorarioForm.vue';
import MovimientoForm from './components/MovimientoForm.vue';

const props = defineProps({ context: Object });
const hosted = computed(() => !!props.context);
// Hosted instances bind the exact host getter and base; replacing either
// retires the previous service so its late results never reach this view.
const ms3Service = computed(() => props.context
  ? createMs3Service({ hosted: true, apiBaseUrl: props.context.apiBaseUrl,
    getAccessToken: props.context.getAccessToken })
  : createMs3Service());
watch(ms3Service, (_, previous) => previous.retire());
// Catalog IDs come only from the ERP. erpUrl is a string, so unrelated context
// updates (navigation) do not recreate the client.
const erpUrl = computed(() => props.context?.serviceBaseUrls?.erp);
const erpService = computed(() => props.context
  ? createErpCatalogService({ hosted: true, erpUrl: erpUrl.value, getAccessToken: props.context.getAccessToken })
  : null);
watch(erpService, (_, previous) => previous?.retire());
const tab = ref(tabForContext(props.context));
watch(() => props.context?.path, () => { tab.value = tabForContext(props.context); });
function selectTab(next) {
  const local = navigateTab(props.context, next);
  if (local) tab.value = local;
}
let active = true;
let loadGeneration = 0;
let catalogGeneration = 0;
const citas = ref([]);
const horarios = ref([]);
const stock = ref([]);
const catalogos = ref({ odontologos: [], consultorios: [], pacientes: [] });
const catalogError = ref(null);
const puedeEditarHorarios = ref(true);
const cargando = ref(true);
const enviando = ref(false);
const error = ref(null);
const mensajeExito = ref('');
const formVersion = ref(0);
// One idempotency key per appointment-creation intent; retries of the same payload reuse it.
const citaIntent = createIntent();
const stockFormVersion = ref(0);
const stockBusy = ref(false);
// A form (including its unresolved intent) belongs to exactly one service.
watch(ms3Service, () => {
  stockFormVersion.value++;
  stockBusy.value = false;
}, { flush: 'sync' });

// Hosted views show the ERP label; unknown IDs fall back to the raw ID.
const nombre = (catalogo, id) => catalogos.value[catalogo].find(item => item.id === id)?.label ?? id;

// The backend guard stays authoritative; this only hides the ADMIN-only form.
function actualizarRol() {
  if (!props.context) { puedeEditarHorarios.value = true; return; }
  let token = null;
  try { token = props.context.getAccessToken(); } catch { /* the service fails closed */ }
  puedeEditarHorarios.value = hasRole(token, 'ADMIN');
}

async function leerDatos(service) {
  const [citasRes, horariosRes, stockRes] = await Promise.all([
    service.getCitas(),
    service.getHorarios(),
    service.getStock()
  ]);
  return { citas: listFrom(citasRes, 'citas'), horarios: listFrom(horariosRes, 'horarios'),
    stock: listFrom(stockRes, 'insumos') };
}

function aplicar(datos) {
  citas.value = datos.citas;
  horarios.value = datos.horarios;
  stock.value = datos.stock;
}

const cargarDatos = async () => {
  const generation = ++loadGeneration;
  cargando.value = true;
  error.value = null;
  actualizarRol();
  try {
    const service = ms3Service.value;
    const datos = await leerDatos(service);
    if (!active || generation !== loadGeneration || service !== ms3Service.value) return;
    aplicar(datos);
  } catch (e) {
    if (active && generation === loadGeneration) error.value = describeError(e);
  } finally {
    if (active && generation === loadGeneration) cargando.value = false;
  }
};

const cargarCatalogos = async () => {
  const service = erpService.value;
  if (!service) return;
  const generation = ++catalogGeneration;
  catalogError.value = null;
  try {
    const [odontologos, consultorios, pacientes] = await Promise.all([
      service.listarOdontologos(), service.listarConsultorios(), service.listarPacientes()]);
    if (!active || generation !== catalogGeneration || service !== erpService.value) return;
    catalogos.value = { odontologos, consultorios, pacientes };
  } catch (e) {
    if (active && generation === catalogGeneration) catalogError.value = e.message;
  }
};

async function buscarPacientes(termino) {
  const service = erpService.value;
  try {
    const pacientes = await service.listarPacientes(termino);
    if (active && service === erpService.value) catalogos.value = { ...catalogos.value, pacientes };
  } catch (e) {
    if (active && service === erpService.value) catalogError.value = e.message;
  }
}

// Runs one explicit user action against the current service, then re-reads the
// server state. A failure keeps the form (and its idempotency intent) for a retry.
async function ejecutar(accion, mensajePorDefecto) {
  if (stockBusy.value) return false;
  const service = ms3Service.value;
  enviando.value = true;
  error.value = null;
  mensajeExito.value = '';
  try {
    const respuesta = await accion(service);
    if (!active || service !== ms3Service.value) return false;
    mensajeExito.value = respuesta?.mensaje || mensajePorDefecto;
    const datos = await leerDatos(service);
    if (active && service === ms3Service.value) aplicar(datos);
    return true;
  } catch (e) {
    if (active && service === ms3Service.value) error.value = describeError(e);
    return false;
  } finally {
    if (active) enviando.value = false;
  }
}

// Stock alone rechecks the live capability after every await. A token refresh
// behind the same getter is valid; a missing/throwing token retires this scope.
function stockScopeLive(service) {
  if (!active || service !== ms3Service.value || service.retired) return false;
  if (hosted.value) {
    let token;
    try { token = props.context.getAccessToken(); } catch { /* fail closed */ }
    if (typeof token !== 'string' || !token) {
      service.retire();
      return false;
    }
  }
  return true;
}

async function registrarMovimiento(payload, submission) {
  const service = ms3Service.value;
  if (stockBusy.value || enviando.value) return;
  if (!stockScopeLive(service)) {
    if (active && service === ms3Service.value) {
      error.value = describeError(new Ms3CapabilityError());
      submission.settle();
    }
    return;
  }
  stockBusy.value = true;
  error.value = null;
  mensajeExito.value = '';
  let acknowledged = false;
  try {
    const respuesta = await service.registrarMovimiento(payload, {
      idempotencyKey: submission.idempotencyKey,
    });
    if (!stockScopeLive(service)) return;
    // Commit the acknowledgement before GET: a failed refresh is not a failed
    // movement and must never leave the completed write available for retry.
    acknowledged = true;
    submission.complete();
    mensajeExito.value = respuesta?.mensaje || 'Movimiento registrado.';
    const datos = await leerDatos(service);
    if (stockScopeLive(service)) aplicar(datos);
  } catch (e) {
    if (stockScopeLive(service)) {
      error.value = acknowledged
        ? `Movimiento registrado; no se pudo actualizar los datos: ${describeError(e)}`
        : describeError(e);
    }
  } finally {
    // A revoked current scope must release its own lock without publishing
    // stale data. A replaced/unmounted scope must never release a newer lock.
    if (active && service === ms3Service.value) {
      const live = stockScopeLive(service);
      stockBusy.value = false;
      submission.settle();
      if (!live) error.value = describeError(new Ms3CapabilityError());
    }
  }
}

async function guardarCita(payload) {
  const idempotencyKey = citaIntent.key(payload);
  const creada = await ejecutar(service => service.crearCita(payload, { idempotencyKey }),
    '¡Cita agendada exitosamente!');
  if (creada) {
    citaIntent.renew();
    formVersion.value++;
  }
}

onMounted(() => { cargarDatos(); cargarCatalogos(); });
watch(ms3Service, cargarDatos);
watch(erpService, cargarCatalogos);
onUnmounted(() => {
  active = false;
  ms3Service.value.retire();
  erpService.value?.retire();
});
</script>

<style scoped>
.container {
  max-width: 1050px;
  margin: 30px auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1e293b;
  padding: 0 20px;
}
.header {
  text-align: center;
  margin-bottom: 25px;
}
.header h1 {
  margin: 0;
  font-size: 26px;
  color: #0f172a;
}
.subtitle {
  color: #64748b;
  font-size: 14px;
  margin-top: 6px;
}
.tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 25px;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 8px;
}
.tabs button {
  padding: 10px 18px;
  border: none;
  background: #f1f5f9;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
  color: #475569;
}
.tabs button.active {
  background: #2563eb;
  color: white;
}
.card {
  background: white;
  padding: 20px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.04);
  margin-bottom: 25px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  align-items: flex-end;
}
.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 5px;
  color: #475569;
}
.form-group input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-sizing: border-box;
}
.btn-primary {
  width: 100%;
  padding: 10px;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover {
  background: #059669;
}
.success-msg {
  color: #059669;
  font-weight: 600;
  margin-top: 12px;
  margin-bottom: 0;
}
.section-title {
  margin: 20px 0 10px 0;
  font-size: 18px;
  color: #334155;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}
.data-table th, .data-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}
.data-table th {
  background-color: #f8fafc;
  color: #475569;
  font-weight: 600;
}
.badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background: #e2e8f0;
}
.badge.disponible, .badge.ok {
  background: #dcfce7;
  color: #166534;
}
.badge.alerta, .badge.ocupado {
  background: #fee2e2;
  color: #991b1b;
}
.loading, .text-center {
  text-align: center;
  padding: 20px;
  color: #64748b;
}
.read-only {
  color: #64748b;
  font-size: 14px;
}
.error {
  background: #fee2e2;
  color: #991b1b;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}
</style>