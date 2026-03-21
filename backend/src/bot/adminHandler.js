import { json, sendMessage } from '../utils/index.js';
import { ADMIN_PROMPTS } from './prompts.js';
import { runAgentChat } from './agent.js';

export async function handleAdminFlow(from, text, textLower, adminInfo, botProfessionalEmail, env) {
    const isMenuCommand = ['menu', 'oi', 'ola', 'opa', 'ok', 'voltar', 'ajuda'].includes(textLower);

    // 1. Gerenciamento de Sessão
    let session = await env.DB.prepare('SELECT * FROM whatsapp_sessions WHERE phone = ?').bind(from).first();

    if (!session || isMenuCommand) {
        await env.DB.prepare('INSERT OR REPLACE INTO whatsapp_sessions (phone, state, user_email, selected_barber_email, metadata) VALUES (?, "admin_ai_chat", ?, ?, "{}")').bind(from, adminInfo.email, adminInfo.email).run();
        
        const menuMsg = ADMIN_PROMPTS.main_menu(adminInfo);
        await sendMessage(env, from, menuMsg, botProfessionalEmail);
        return json({ success: true });
    }

    // 2. Buscar Status do WhatsApp para Contexto do Admin
    const waStatus = await env.DB.prepare('SELECT wa_status FROM users WHERE email = ?').bind(adminInfo.email).first();
    const currentStatus = waStatus?.wa_status || 'disconnected';

    let promptEnriched = text;
    if (isMenuCommand && currentStatus !== 'connected') {
        promptEnriched += ` (Nota para IA: O WhatsApp está ${currentStatus === 'awaiting_qr' ? 'aguardando QR Code' : 'desconectado'}. Informe o usuário e sugira conectar se necessário)`;
    }

    const metadata = JSON.parse(session?.metadata || '{}');
    const history = metadata.history || [];

    // 2.1 PAGINAÇÃO DA AGENDA
    if (session?.state === 'admin_viewing_agenda' && text === '8') {
        const lastPage = metadata.last_agenda_page || 1;
        return await showAgenda(from, adminInfo, botProfessionalEmail, env, lastPage + 1, session);
    }

    // 3. FLUXO AGÊNTICO
    try {
        const professionalContext = {
            establishmentName: adminInfo.shop_name || adminInfo.name || 'Estabelecimento',
            professionalEmail: adminInfo.email,
            owner_id: adminInfo.owner_id,
            business_type: adminInfo.business_type || 'default', // Multi-nicho
            name: adminInfo.name,
            bName: adminInfo.bot_name || 'Leo',
            bTone: adminInfo.bot_tone || 'profissional',
            isMaster: adminInfo.email === 'celsosilvajunior90@gmail.com'
        };

        const aiData = await runAgentChat(env, {
            prompt: promptEnriched,
            isAdmin: true,
            userEmail: adminInfo.email,
            professionalContext: professionalContext,
            history: history
        });

        const aiMsg = aiData.text || "Chefe, não consegui processar isso agora. Pode me mandar a dúvida de novo?";

        // Atualizar histórico (limitar a 6 mensagens para Admin, para dar espaço ao briefing)
        const updatedHistory = [
            ...history,
            { role: 'user', content: text },
            { role: 'assistant', content: aiMsg }
        ].slice(-6);

        metadata.history = updatedHistory;
        await env.DB.prepare('UPDATE whatsapp_sessions SET metadata = ? WHERE phone = ?').bind(JSON.stringify(metadata), from).run();

        await sendMessage(env, from, aiMsg, botProfessionalEmail);
        return json({ success: true });

    } catch (e) {
        console.error('[Agentic Admin Flow Error]', e);
        return await handleIntentsFallback(from, text, adminInfo, botProfessionalEmail, env);
    }
}

async function showAgenda(from, adminInfo, botProfessionalEmail, env, page = 1, session = null) {
    const limit = 8;
    const offset = (page - 1) * limit;
    const brazilTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const todayStr = brazilTime.toLocaleDateString("en-CA");
    const timeStr = brazilTime.toTimeString().slice(0, 5);

    const appts = await env.DB.prepare(`
        SELECT a.appointment_date, a.appointment_time, s.name as service_name, u.name as client_name
        FROM appointments a 
        JOIN services s ON a.service_id = s.id 
        JOIN users u ON a.user_email = u.email
        WHERE a.barber_email = ? AND (a.appointment_date > ? OR (a.appointment_date = ? AND a.appointment_time >= ?)) 
        AND a.status IN ('pending','confirmed')
        ORDER BY a.appointment_date, a.appointment_time 
        LIMIT ? OFFSET ?
    `).bind(adminInfo.email, todayStr, todayStr, timeStr, limit + 1, offset).all();

    const metadata = JSON.parse(session?.metadata || '{}');
    metadata.last_agenda_page = page;
    await env.DB.prepare('UPDATE whatsapp_sessions SET metadata = ? WHERE phone = ?').bind(JSON.stringify(metadata), from).run();

    if (appts.results.length === 0 && page === 1) {
        await sendMessage(env, from, "Chefe, sua agenda está livre. 👍\n\n" + ADMIN_PROMPTS.main_menu(adminInfo), botProfessionalEmail);
        return json({ success: true });
    }

    const resultsToShow = appts.results.length > limit ? appts.results.slice(0, limit) : appts.results;

    let msg = `📅 *Sua Agenda (Pág ${page})*:\n\n`;
    resultsToShow.forEach(a => {
        const dp = a.appointment_date.split('-');
        msg += `• *${dp[2]}/${dp[1]}* às *${a.appointment_time}*\n  ${a.client_name} - ${a.service_name}\n\n`;
    });

    if (appts.results.length > limit) msg += "8️⃣ - ➕ Ver mais clientes\n";
    msg += "\n*Comandos Rápidos:* Digite 'Cancele o das 14h' ou 'Confirme João'.";

    await sendMessage(env, from, msg, botProfessionalEmail);
    return json({ success: true });
}


async function handleIntentsFallback(from, text, adminInfo, botProfessionalEmail, env) {
    await sendMessage(env, from, "⚠️ Tive um problema ao acessar a inteligência agora. Por favor, tente usar os números do menu ou tente novamente em instantes.", botProfessionalEmail);
    await sendMessage(env, from, ADMIN_PROMPTS.main_menu(adminInfo), botProfessionalEmail);
    return json({ success: true });
}