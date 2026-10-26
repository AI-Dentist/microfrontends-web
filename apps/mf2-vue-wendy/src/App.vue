<template>
  <div class="container">
    <header class="header">
      <h1>Microfrontend MF2 — Agenda, Horarios y Stock</h1>
      <p class="subtitle">Conectado a MS3 (Laravel - Puerto 8001)</p>
    </header>

    <!-- Navegación entre módulos -->
    <div class="tabs">
      <button :class="{ active: tab === 'citas' }" @click="tab = 'citas'">📅 Citas Agendadas</button>
      <button :class="{ active: tab === 'horarios' }" @click="tab = 'horarios'">⏰ Horarios Médicos</button>
      <button :class="{ active: tab === 'stock' }" @click="tab = 'stock'">📦 Inventario y Stock</button>
    </div>

    <main class="content">
      <div v-if="cargando" class="loading">Cargando datos desde MS3...</div>
      <div v-if="error" class="error">{{ error }}</div>

      <!-- TAB 1: CITAS (Listado + Formulario) -->
      <section v-if="tab === 'citas' && !cargando">
        <!-- Formulario de Agendamiento -->
        <div class="card form-card">
          <h3>Agendar Nueva Cita Médica</h3>
          <form @submit.prevent="guardarCita" class="form-grid">
            <div class="form-group">
              <label>Paciente ID:</label>
              <input v-model="nuevaCita.paciente_id" required placeholder="Ej: pac-001" />
            </div>
            <div class="form-group">
              <label>Odontólogo ID:</label>
              <input v-model="nuevaCita.odontologo_id" required placeholder="Ej: odo-123" />
            </div>
            <div class="form-group">
              <label>Consultorio ID:</label>
              <input v-model="nuevaCita.consultorio_id" required placeholder="Ej: con-01" />
            </div>
            <div class="form-group">
              <label>Fecha y Hora:</label>
              <input type="datetime-local" v-model="nuevaCita.fecha_hora" required />
            </div>
            <div class="form-action">
              <button type="submit" class="btn-primary" :disabled="enviando">
                {{ enviando ? 'Agendando...' : 'Confirmar Cita' }}
              </button>
            </div>
          </form>
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
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in citas" :key="c.id">
              <td><code>{{ c.id.substring(0, 8) }}...</code></td>
              <td>{{ c.fecha_hora }}</td>
              <td>{{ c.odontologo_id }}</td>
              <td>{{ c.consultorio_id }}</td>
              <td>{{ c.paciente_id }}</td>
              <td><span class="badge">{{ c.estado }}</span></td>
            </tr>
            <tr v-if="citas.length === 0">
              <td colspan="6" class="text-center">No hay citas agendadas</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- TAB 2: HORARIOS -->
      <section v-if="tab === 'horarios' && !cargando">
        <h3 class="section-title">Disponibilidad de Odontólogos</h3>
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
              <td>{{ h.odontologo_id }}</td>
              <td>{{ h.especialidad }}</td>
              <td>{{ h.consultorio_id }}</td>
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
import { ref, onMounted } from 'vue';
import { ms3Service } from './api/ms3Api';

const tab = ref('citas');
const citas = ref([]);
const horarios = ref([]);
const stock = ref([]);
const cargando = ref(true);
const enviando = ref(false);
const error = ref(null);
const mensajeExito = ref('');

const nuevaCita = ref({
  paciente_id: '',
  odontologo_id: '',
  consultorio_id: '',
  fecha_hora: ''
});

const cargarDatos = async () => {
  cargando.value = true;
  error.value = null;
  try {
    const [citasRes, horariosRes, stockRes] = await Promise.all([
      ms3Service.getCitas(),
      ms3Service.getHorarios(),
      ms3Service.getStock()
    ]);
    citas.value = citasRes.citas || [];
    horarios.value = horariosRes.horarios || [];
    stock.value = stockRes.insumos || [];
  } catch (err) {
    error.value = 'Error al conectar con el backend MS3 en http://localhost:8001.';
    console.error(err);
  } finally {
    cargando.value = false;
  }
};

const guardarCita = async () => {
  enviando.value = true;
  mensajeExito.value = '';
  try {
    const formattedDate = nuevaCita.value.fecha_hora.replace('T', ' ') + 
      (nuevaCita.value.fecha_hora.length === 16 ? ':00' : '');

    const payload = {
      paciente_id: nuevaCita.value.paciente_id,
      odontologo_id: nuevaCita.value.odontologo_id,
      consultorio_id: nuevaCita.value.consultorio_id,
      fecha_hora: formattedDate
    };

    const resCrear = await ms3Service.crearCita(payload);
    console.log('Respuesta backend al crear:', resCrear);

    // Si Laravel devolvió un error de validación HTTP
    if (resCrear.error || resCrear.errors) {
      alert('Error de validación: ' + JSON.stringify(resCrear.error || resCrear.errors));
      return;
    }

    mensajeExito.value = '¡Cita agendada exitosamente!';

    // Si el backend devolvió el objeto cita, lo agregamos de inmediato a la lista
    if (resCrear.cita) {
      citas.value.unshift(resCrear.cita);
    } else {
      // Si devolvió solo mensaje, agregamos los datos locales con un ID temporal
      citas.value.unshift({
        id: resCrear.id || 'temp-' + Date.now().toString(16),
        fecha_hora: payload.fecha_hora,
        odontologo_id: payload.odontologo_id,
        consultorio_id: payload.consultorio_id,
        paciente_id: payload.paciente_id,
        estado: 'RESERVADA'
      });
    }

    // Limpiar formulario
    nuevaCita.value = { paciente_id: '', odontologo_id: '', consultorio_id: '', fecha_hora: '' };

    // Sincronizar en segundo plano con el archivo de persistencia
    setTimeout(async () => {
      const resListado = await ms3Service.getCitas();
      if (resListado && resListado.citas) {
        citas.value = resListado.citas;
      }
    }, 500);

  } catch (err) {
    console.error('Error al agendar cita:', err);
    alert('Ocurrió un error al contactar al backend.');
  } finally {
    enviando.value = false;
  }
};

onMounted(() => {
  cargarDatos();
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
.error {
  background: #fee2e2;
  color: #991b1b;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}
</style>