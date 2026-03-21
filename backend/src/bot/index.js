import { json } from '../utils/index.js';
import { handleAdminFlow } from './adminHandler.js';
import { handleClientFlow } from './clientHandler.js';
import { handleRegistrationFlow } from './registrationHandler.js';

export async function handleWhatsAppWebhook(request, env) {
    console.log('[Webhook] Recibido POST');
    const body = await request.json();

    const from = body.jid || body.phone?.replace(/\D/g, ""); // JID oficial ou telefone limpo
    const text = (body.message || "").trim();
    const textLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const botProfessionalEmail = body.professional_email || body.barber_email; // E-mail da unidade/bot que recebeu
    const isSelfChat = body.is_self_chat === true;

    if (!from) return json({ error: "Missing phone" }, 400);

    let dbPhone = from.replace(/\D/g, ""); // Número para o DB
    if (dbPhone.startsWith("55") && dbPhone.length > 10) dbPhone = dbPhone.substring(2);

    const last8 = dbPhone.slice(-8);

    // 1. Identificar o Usuário no Banco (Quem está falando?)
    let senderInfo = null;

    const isMaster = (isSelfChat && botProfessionalEmail === 'celsosilvajunior90@gmail.com');

    // Se é Self-Chat, o remetente é o dono do bot (o admin)
    if (isSelfChat && botProfessionalEmail) {
        senderInfo = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(botProfessionalEmail).first();
    }
    
    // Se ainda não achou e é o Celso (Master)
    if (!senderInfo && isMaster) {
        senderInfo = await env.DB.prepare('SELECT * FROM users WHERE email = "celsosilvajunior90@gmail.com"').first();
    }

    // Busca direta por telefone (sem 55)
    if (!senderInfo) {
        senderInfo = await env.DB.prepare(
            'SELECT * FROM users WHERE (phone = ? OR phone LIKE ?) AND (is_admin = 1 OR is_barber = 1)'
        ).bind(dbPhone, `%${last8}`).first();
    }

    // 2. Identificar se existe sessão (Tenta JID primeiro, depois dbPhone)
    let session = await env.DB.prepare('SELECT * FROM whatsapp_sessions WHERE phone = ? OR phone = ?').bind(from, dbPhone).first();

    // 3. Roteamento de Registro (Novos Profissionais)
    const registrationTriggers = ['quero ser parceiro', 'quero usar o sistema', 'cadastro profissional', 'criar conta', 'registrar'];
    const isRegistrationTrigger = registrationTriggers.some(t => textLower.includes(t));
    const isRegistrationSession = session?.state?.startsWith('reg_');

    if ((isRegistrationTrigger || isRegistrationSession) && !senderInfo) {
        return await handleRegistrationFlow(from, text, textLower, session, env);
    }

    // 4. Fluxo de Usuários Existentes (Admin/Profissional)
    if (senderInfo && (senderInfo.is_admin === 1 || senderInfo.is_barber === 1)) {
        return await handleAdminFlow(from, text, textLower, senderInfo, botProfessionalEmail, env);
    } else {
        // Caso contrário, trata como cliente normal
        let userInDb = await env.DB.prepare('SELECT * FROM users WHERE phone = ? OR phone LIKE ?').bind(dbPhone, `%${last8}`).first();

        // Se o cliente não existe, criar perfil básico para evitar erro de FK
        if (!userInDb) {
            const guestEmail = `guest_${dbPhone}@whatsapp.com`;
            await env.DB.prepare('INSERT OR IGNORE INTO users (email, name, phone, is_admin, is_barber) VALUES (?, ?, ?, 0, 0)')
                .bind(guestEmail, `Cliente ${dbPhone}`, dbPhone).run();
            userInDb = { email: guestEmail, phone: dbPhone, name: `Cliente ${dbPhone}` };
        }

        return await handleClientFlow(from, text, textLower, session, userInDb, botProfessionalEmail, env);
    }
}
