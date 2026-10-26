const BASE_URL = 'http://localhost:8001/api/agendamiento';

export const ms3Service = {
  // 1. Obtener listado de citas
  async getCitas() {
    const res = await fetch(`${BASE_URL}/citas`);
    return await res.json();
  },

  // 2. Registrar nueva cita con Idempotencia
  async crearCita(datosCita) {
    const idempotencyKey = 'key-' + Date.now();
    const res = await fetch(`${BASE_URL}/citas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(datosCita)
    });
    return await res.json();
  },

  // 3. Consultar horarios de odontólogos
  async getHorarios() {
    const res = await fetch(`${BASE_URL}/horarios`);
    return await res.json();
  },

  // 4. Consultar stock e insumos
  async getStock() {
    const res = await fetch(`${BASE_URL}/stock`);
    return await res.json();
  }
};