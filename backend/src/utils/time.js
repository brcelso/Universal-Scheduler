export function isValidAppointmentTime(time) {
    if (!time || typeof time !== 'string') return false;
    const parts = time.split(':');
    if (parts.length !== 2) return false;
    
    const minutes = parseInt(parts[1], 10);
    return minutes === 0 || minutes === 30;
}

export function isPastDateTime(date, time) {
    const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const apptDate = new Date(`${date}T${time}:00`);
    return apptDate < agora;
}
