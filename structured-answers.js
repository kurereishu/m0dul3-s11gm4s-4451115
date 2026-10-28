// Validate the entire mapping before allowing any field to be changed.
function validateAssignments(slots, assignments, type) {
  if (!Array.isArray(assignments) || assignments.length !== slots.length) {
    throw new Error("Gemini no devolvio una respuesta para cada espacio.");
  }
  const seen = new Set();
  const used = new Set();
  const validated = assignments.map((assignment) => {
    const slot = slots.find((item) => item.id === assignment?.slotId);
    if (!slot || seen.has(slot.id)) throw new Error("Identificador de espacio invalido o repetido.");
    seen.add(slot.id);
    const option = slot.options.find((item) => item.value === assignment.value);
    if (!option) throw new Error("La respuesta no pertenece a las opciones del espacio.");
    if (type === "drag_slots" && !option.reusable && used.has(option.value)) {
      throw new Error("Una opcion de arrastre no reutilizable se repitio.");
    }
    used.add(option.value);
    return { slotId: slot.id, value: option.value, text: option.text };
  });
  return slots.map((slot) => validated.find((item) => item.slotId === slot.id));
}

function readSlots(payload) {
  if (!Array.isArray(payload?.slots) || !payload.slots.length || payload.slots.length > 50) {
    throw new Error("Numero de espacios invalido.");
  }
  const seen = new Set();
  return payload.slots.map((slot) => {
    if (!slot || typeof slot.id !== "string" || seen.has(slot.id) ||
        !Array.isArray(slot.options) || !slot.options.length || slot.options.length > 200) {
      throw new Error("Espacio sin opciones o identificador valido.");
    }
    seen.add(slot.id);
    const values = new Set();
    const options = slot.options.map((option) => {
      if (typeof option?.value !== "string" || typeof option.text !== "string" ||
          !option.text.trim() || values.has(option.value)) throw new Error("Opcion invalida o repetida.");
      values.add(option.value);
      return { value: option.value, text: option.text, reusable: option.reusable === true };
    });
    return { id: slot.id, label: String(slot.label || ""), options };
  });
}

module.exports = { validateAssignments, readSlots };
