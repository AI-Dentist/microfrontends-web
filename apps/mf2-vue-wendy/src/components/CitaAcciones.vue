<template>
  <div v-if="activa" class="acciones">
    <button :disabled="busy" @click="$emit('cancelar')">Cancelar</button>
    <button :disabled="busy" @click="$emit('no-asistio')">No asistió</button>
    <button :disabled="busy" @click="modo = modo === 'reprogramar' ? null : 'reprogramar'">Reprogramar</button>
    <button :disabled="busy" @click="modo = modo === 'completar' ? null : 'completar'">Completar</button>

    <form v-if="modo === 'reprogramar'" class="panel" @submit.prevent="reprogramar">
      <input type="datetime-local" v-model="nuevaFecha" required />
      <button type="submit" :disabled="busy">Confirmar nueva fecha</button>
    </form>

    <form v-if="modo === 'completar'" class="panel" @submit.prevent="completar">
      <p class="hint">El stock solo se descuenta de los insumos que liste aquí; sin insumos, la cita se completa sin tocar el inventario.</p>
      <div v-for="(fila, i) in insumos" :key="i" class="fila">
        <select v-model="fila.insumo_id" required>
          <option value="" disabled>Insumo</option>
          <option v-for="item in stock" :key="item.id" :value="item.id">{{ item.codigo }} — {{ item.nombre }} ({{ item.stock_actual }})</option>
        </select>
        <input type="number" min="1" step="1" v-model.number="fila.cantidad" required />
        <button type="button" @click="insumos.splice(i, 1)">Quitar</button>
      </div>
      <button type="button" @click="insumos.push({ insumo_id: '', cantidad: 1 })">Agregar insumo</button>
      <input v-model="motivo" placeholder="Motivo (opcional)" />
      <button type="submit" :disabled="busy">Confirmar finalización</button>
    </form>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({ cita: { type: Object, required: true }, stock: { type: Array, default: () => [] }, busy: Boolean });
const emit = defineEmits(['cancelar', 'no-asistio', 'reprogramar', 'completar']);
const activa = computed(() => !['COMPLETADA', 'CANCELADA', 'NO_ASISTIO'].includes(props.cita.estado));
const modo = ref(null);
const nuevaFecha = ref('');
const insumos = ref([]);
const motivo = ref('');

function reprogramar() { emit('reprogramar', nuevaFecha.value); }
function completar() {
  emit('completar', { insumos: insumos.value.map(({ insumo_id, cantidad }) => ({ insumo_id, cantidad })), motivo: motivo.value });
}
</script>

<style scoped>
.acciones { display: flex; flex-wrap: wrap; gap: 6px; }
.acciones button { padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; cursor: pointer; font-size: 12px; }
.panel { flex-basis: 100%; display: flex; flex-direction: column; gap: 6px; padding: 8px; background: #f8fafc; border-radius: 6px; }
.fila { display: flex; gap: 6px; }
.hint { margin: 0; font-size: 12px; color: #64748b; }
</style>
