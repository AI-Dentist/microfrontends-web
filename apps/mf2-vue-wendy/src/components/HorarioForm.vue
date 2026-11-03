<template>
  <form @submit.prevent="$emit('crear', { ...horario })" class="form-grid">
    <p v-if="hosted && catalogError" class="catalog-error">{{ catalogError }}</p>
    <div class="form-group">
      <label>Odontólogo:</label>
      <select v-if="hosted" v-model="horario.odontologo_id" required>
        <option value="" disabled>Seleccione un odontólogo</option>
        <option v-for="o in catalogos.odontologos" :key="o.id" :value="o.id">{{ o.label }}</option>
      </select>
      <input v-else v-model="horario.odontologo_id" required placeholder="UUID del odontólogo" />
    </div>
    <div class="form-group">
      <label>Consultorio:</label>
      <select v-if="hosted" v-model="horario.consultorio_id" required>
        <option value="" disabled>Seleccione un consultorio</option>
        <option v-for="c in catalogos.consultorios" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
      <input v-else v-model="horario.consultorio_id" required placeholder="UUID del consultorio" />
    </div>
    <div class="form-group"><label>Especialidad:</label><input v-model="horario.especialidad" required /></div>
    <div class="form-group"><label>Fecha:</label><input type="date" v-model="horario.fecha" required /></div>
    <div class="form-group"><label>Desde:</label><input type="time" v-model="horario.hora_inicio" required /></div>
    <div class="form-group"><label>Hasta:</label><input type="time" v-model="horario.hora_fin" required /></div>
    <div class="form-group"><label><input type="checkbox" v-model="horario.disponible" /> Disponible</label></div>
    <div class="form-action">
      <button type="submit" class="btn-primary" :disabled="busy || (hosted && !!catalogError)">Crear horario</button>
    </div>
  </form>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  hosted: Boolean,
  catalogos: { type: Object, default: () => ({ odontologos: [], consultorios: [] }) },
  catalogError: String,
  busy: Boolean,
});
defineEmits(['crear']);
const horario = ref({ odontologo_id: '', consultorio_id: '', especialidad: '', fecha: '',
  hora_inicio: '', hora_fin: '', disponible: true });
</script>

<style scoped>
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; align-items: flex-end; }
.form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 5px; color: #475569; }
.form-group input:not([type='checkbox']), .form-group select { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; }
.catalog-error { grid-column: 1 / -1; margin: 0; color: #991b1b; background: #fee2e2; padding: 10px; border-radius: 6px; }
.btn-primary { width: 100%; padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
