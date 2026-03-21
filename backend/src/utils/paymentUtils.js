
export async function createMPPreference(env, DB, appointmentId) {
    try {
        const appt = await DB.prepare(`
            SELECT a.*, s.name as service_name, s.price 
            FROM appointments a 
            JOIN services s ON a.service_id = s.id 
            WHERE a.id = ?
        `).bind(appointmentId).first();

        if (!appt) return { error: 'Agendamento não encontrado.' };

        // Buscar Access Token do Profissional (ou usar o global)
        const professional = await DB.prepare('SELECT mp_access_token FROM users WHERE email = ?').bind(appt.barber_email).first();
        const accessToken = professional?.mp_access_token || env.MP_ACCESS_TOKEN;

        if (!accessToken || accessToken === 'TEST_TOKEN') {
             // Fallback para link interno se não houver token real configurado
             return { paymentUrl: `${env.FRONTEND_URL || 'https://universal-scheduler.pages.dev'}/pay/${appointmentId}` };
        }

        const mpPref = {
            items: [{
                title: `Agendamento - ${appt.service_name}`,
                quantity: 1,
                unit_price: appt.price,
                currency_id: 'BRL'
            }],
            external_reference: appointmentId,
            back_urls: {
                success: `${env.FRONTEND_URL}/success?id=${appointmentId}`,
                failure: `${env.FRONTEND_URL}/cancel?id=${appointmentId}`,
                pending: `${env.FRONTEND_URL}/pending?id=${appointmentId}`
            },
            auto_return: 'approved'
        };

        const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(mpPref)
        });

        const mpD = await mpRes.json();
        
        const finalUrl = mpD.init_point || mpD.sandbox_init_point;
        return { paymentUrl: finalUrl };
    } catch (error) {
        console.error('[createMPPreference Error]', error.message);
        return { error: 'Falha ao gerar link de pagamento.' };
    }
}
