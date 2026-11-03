<template>
  <form @submit.prevent="registrar" class="form-grid">
    <div class="form-group">
      <label>Insumo:</label>
      <select v-model="mov.insumo_id" required>
        <option value="" disabled>Seleccione un insumo</option>
        <option v-for="item in stock" :key="item.id" :value="item.id">{{ item.codigo }} — {{ item.nombre }}</option>
      </select>
    </div>
    <div class="form-group">
      <label>Tipo de movimiento:</label>
      <select v-model="mov.tipo_movimiento" required>
        <option v-for="tipo in tipos" :key="tipo" :value="tipo">{{ tipo }}</option>
      </select>
    </div>
    <div v-if="mov.tipo_movimiento === 'AJUSTE'" class="form-group">
      <label>Dirección del ajuste:</label>
      <select v-model="mov.direccion">
        <option value="INCREMENTO">INCREMENTO</option>
        <option value="DECREMENTO">DECREMENTO</option>
      </select>
    </div>
    <div class="form-group"><label>Cantidad:</label><input type="number" min="1" step="1" v-model.number="mov.cantidad" required /></div>
    <div class="form-group"><label>Motivo:</label><input v-model="mov.motivo" required /></div>
    <div class="form-action">
      <button type="submit" class="btn-primary" :disabled="busy">Registrar movimiento</button>
    </div>
  </form>
</template>

<script setup>
import { ref } from 'vue';
import { MOVEMENT_TYPES as tipos } from '../api/ms3Api.js';

defineProps({ stock: { type: Array, default: () => [] }, busy: Boolean });
const emit = defineEmits(['registrar']);
const mov = ref({ insumo_id: '', tipo_movimiento: 'ENTRADA_COMPRA', direccion: 'INCREMENTO', cantidad: 1, motivo: '' });

// Only an explicit user action moves stock; the direction is sent for AJUSTE only.
function registrar() {
  const { direccion, ...base } = mov.value;
  emit('registrar', base.tipo_movimiento === 'AJUSTE' ? { ...base, direccion } : base);
}
</script>

<style scoped>
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; align-items: flex-end; }
.form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 5px; color: #475569; }
.form-group input, .form-group select { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; }
.btn-primary { width: 100%; padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
