/** Body of POST /consultas-odontologicas: DTO fields only; MS2 derives the doctor from the token. */
export function buildAperturaPayload({
  historiaClinicaId, pacienteId, motivoConsulta, citaId, fechaAtencion, anamnesis,
}) {
  const payload = {
    historiaClinicaId: historiaClinicaId.trim(),
    pacienteId: pacienteId.trim(),
    motivoConsulta: motivoConsulta.trim(),
    citaId: citaId && citaId.trim() ? citaId.trim() : null,
    fechaAtencion: fechaAtencion ? new Date(fechaAtencion).toISOString() : new Date().toISOString(),
  };
  if (anamnesis && anamnesis.descripcion && anamnesis.descripcion.trim()) {
    payload.anamnesisActual = {
      descripcion: anamnesis.descripcion.trim(),
      tiempoEvolucion: (anamnesis.tiempoEvolucion || '').trim() || null,
      escalaDolorEVA: anamnesis.escalaDolorEVA !== '' && anamnesis.escalaDolorEVA != null
        ? Number(anamnesis.escalaDolorEVA) : null,
    };
  }
  return payload;
}
