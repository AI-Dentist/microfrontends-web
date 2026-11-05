<template>
  <form @submit.prevent="registrar" class="form-grid">
    <div class="form-group">
      <label>Insumo:</label>
      <select v-model="mov.insumo_id" :disabled="locked" required>
        <option value="" disabled>Seleccione un insumo</option>
        <option v-for="item in stock" :key="item.id" :value="item.id">{{ item.codigo }} — {{ item.nombre }}</option>
      </select>
    </div>
    <div class="form-group">
      <label>Tipo de movimiento:</label>
      <select v-model="mov.tipo_movimiento" :disabled="locked" required>
        <option v-for="tipo in tipos" :key="tipo" :value="tipo">{{ tipo }}</option>
      </select>
    </div>
    <div v-if="mov.tipo_movimiento === 'AJUSTE'" class="form-group">
      <label>Dirección del ajuste:</label>
      <select v-model="mov.direccion" :disabled="locked">
        <option value="INCREMENTO">INCREMENTO</option>
        <option value="DECREMENTO">DECREMENTO</option>
      </select>
    </div>
    <div class="form-group"><label>Cantidad:</label><input type="number" min="1" step="1" v-model.number="mov.cantidad" :disabled="locked" required /></div>
    <div class="form-group"><label>Motivo:</label><input v-model="mov.motivo" :disabled="locked" required /></div>
    <div class="form-action">
      <button type="submit" class="btn-primary" :disabled="locked">Registrar movimiento</button>
    </div>
  </form>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { createIntent, MOVEMENT_TYPES as tipos } from '../api/ms3Api.js';

const props = defineProps({ stock: { type: Array, default: () => [] }, busy: Boolean });
const emit = defineEmits(['registrar']);
const emptyDraft = () => ({ insumo_id: '', tipo_movimiento: 'ENTRADA_COMPRA', direccion: 'INCREMENTO', cantidad: 1, motivo: '' });
const mov = ref(emptyDraft());
const pending = ref(false);
const locked = computed(() => pending.value || props.busy);
const intent = createIntent();
// Even an edit followed by an undo is a new user intent.
watch(mov, () => intent.renew(), { deep: true, flush: 'sync' });

// Capture once at confirmation, never in the transport. The parent acknowledges
// the POST independently of readback and releases only this form's submission.
function registrar() {
  if (locked.value) return;
  pending.value = true;
  const { direccion, ...base } = mov.value;
  const payload = Object.freeze(base.tipo_movimiento === 'AJUSTE' ? { ...base, direccion } : base);
  const idempotencyKey = intent.key(payload);
  emit('registrar', payload, {
    idempotencyKey,
    complete() {
      intent.renew();
      mov.value = emptyDraft();
    },
    settle() { pending.value = false; },
  });
}
</script>

<style scoped>
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; align-items: flex-end; }
.form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 5px; color: #475569; }
.form-group input, .form-group select { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; }
.btn-primary { width: 100%; padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
