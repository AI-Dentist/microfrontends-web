<template>
  <form @submit.prevent="enviar" class="form-grid">
    <p v-if="hosted && catalogError" class="catalog-error">{{ catalogError }}</p>
    <div class="form-group">
      <label>Paciente:</label>
      <select v-if="hosted" v-model="cita.paciente_id" required>
        <option value="" disabled>Seleccione un paciente</option>
        <option v-for="p in catalogos.pacientes" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>
      <input v-else v-model="cita.paciente_id" required placeholder="Ej: pac-001" />
      <input v-if="hosted" class="search" placeholder="Buscar paciente" @change="$emit('buscar-pacientes', $event.target.value)" />
    </div>
    <div class="form-group">
      <label>Odontólogo:</label>
      <select v-if="hosted" v-model="cita.odontologo_id" required>
        <option value="" disabled>Seleccione un odontólogo</option>
        <option v-for="o in catalogos.odontologos" :key="o.id" :value="o.id">{{ o.label }}</option>
      </select>
      <input v-else v-model="cita.odontologo_id" required placeholder="Ej: odo-123" />
    </div>
    <div class="form-group">
      <label>Consultorio:</label>
      <select v-if="hosted" v-model="cita.consultorio_id" required>
        <option value="" disabled>Seleccione un consultorio</option>
        <option v-for="c in catalogos.consultorios" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
      <input v-else v-model="cita.consultorio_id" required placeholder="Ej: con-01" />
    </div>
    <div class="form-group">
      <label>Fecha y Hora:</label>
      <input type="datetime-local" v-model="cita.fecha_hora" required />
    </div>
    <div class="form-action">
      <button type="submit" class="btn-primary" :disabled="enviando || (hosted && !!catalogError)">
        {{ enviando ? 'Agendando...' : 'Confirmar Cita' }}
      </button>
    </div>
  </form>
</template>

<script setup>
import { ref } from 'vue';
import { toBackendDateTime } from '../api/ms3Api.js';

defineProps({
  hosted: Boolean,
  catalogos: { type: Object, default: () => ({ pacientes: [], odontologos: [], consultorios: [] }) },
  catalogError: String,
  enviando: Boolean,
});
const emit = defineEmits(['guardar', 'buscar-pacientes']);
const cita = ref({ paciente_id: '', odontologo_id: '', consultorio_id: '', fecha_hora: '' });

// The parent derives the idempotency key from this payload, so a retry reuses it.
function enviar() {
  emit('guardar', { ...cita.value, fecha_hora: toBackendDateTime(cita.value.fecha_hora) });
}
</script>

<style scoped>
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; align-items: flex-end; }
.form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 5px; color: #475569; }
.form-group input, .form-group select { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; }
.search { margin-top: 6px; }
.catalog-error { grid-column: 1 / -1; margin: 0; color: #991b1b; background: #fee2e2; padding: 10px; border-radius: 6px; }
.btn-primary { width: 100%; padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
