
import { handleClientFlow } from './bot/clientHandler.js';
import { execSync } from 'child_process';

const sanitizeSql = (sql) => sql.replace(/\s+/g, ' ').trim();

// Mock DB wrapper to execute REMOTE commands
const remoteDB = {
    prepare: (sql) => ({
        bind: (...args) => ({
            run: async () => {
                const cleanSql = sanitizeSql(sql).replace(/\?/g, () => {
                    const arg = args.shift();
                    return typeof arg === 'string' ? `'${arg}'` : (arg === null ? 'NULL' : arg);
                });
                console.log(`[SQL EXEC] ${cleanSql}`);
                try {
                    execSync(`npx wrangler d1 execute barber-db --remote --command="${cleanSql}"`, { encoding: 'utf-8', stdio: 'inherit' });
                    return { success: true };
                } catch {
                    return { success: false };
                }
            },
            all: async () => {
                const cleanSql = sanitizeSql(sql).replace(/\?/g, () => {
                    const arg = args.shift();
                    return typeof arg === 'string' ? `'${arg}'` : (arg === null ? 'NULL' : arg);
                });
                console.log(`[SQL QUERY] ${cleanSql}`);
                try {
                    const output = execSync(`npx wrangler d1 execute barber-db --remote --command="${cleanSql}" --json`, { encoding: 'utf-8' });
                    const parsed = JSON.parse(output);
                    return { results: parsed[0]?.results || [] };
                } catch {
                    return { results: [] };
                }
            },
            first: async () => {
                const cleanSql = sanitizeSql(sql).replace(/\?/g, () => {
                    const arg = args.shift();
                    return typeof arg === 'string' ? `'${arg}'` : (arg === null ? 'NULL' : arg);
                });
                console.log(`[SQL FIRST] ${cleanSql}`);
                try {
                    const output = execSync(`npx wrangler d1 execute barber-db --remote --command="${cleanSql}" --json`, { encoding: 'utf-8' });
                    const parsed = JSON.parse(output);
                    return parsed[0]?.results[0] || null;
                } catch {
                    return null;
                }
            }
        })
    })
};

// Deterministic AI specifically for Ricardo's Real Test
let step = 0;
let lastApptId = '';
const mockAI = {
    run: async ({ messages }) => {
        console.log(`[AI DECISION] Model: gpt-mock`);
        // step++;
        step++;
        
        if (step === 1) { // Booking
            return {
                tool_calls: [{
                    id: 'c1',
                    name: 'agendar_cliente',
                    arguments: {
                        user_email: 'zacchiricardo9@gmail.com',
                        professional_email: 'celsosilvajunior90@gmail.com',
                        service_id: 'corte-simples',
                        date: '2026-03-23',
                        time: '14:00'
                    }
                }]
            };
        }
        
        if (step === 2) { // Response with payment link (provided by toolActions)
             return { response: messages[messages.length-1].content }; // Relay logic
        }

        if (step === 3) { // Rescheduling
            return {
                tool_calls: [
                    {
                        id: 'c2_cancel',
                        name: 'alterar_status_agendamento',
                        arguments: { appointment_id: lastApptId, status: 'cancelled' }
                    },
                    {
                        id: 'c2_book',
                        name: 'agendar_cliente',
                        arguments: {
                            user_email: 'zacchiricardo9@gmail.com',
                            professional_email: 'celsosilvajunior90@gmail.com',
                            service_id: 'corte-simples',
                            date: '2026-03-23',
                            time: '15:00'
                        }
                    }
                ]
            };
        }
        
        return { response: "Agendamento atualizado para amanhã às 15h. Seu novo link de pagamento está acima!" };
    }
};

const mockEnv = {
    DB: remoteDB,
    AI: mockAI,
    WA_BRIDGE_KEY: 'universal-secret-key',
    MP_ACCESS_TOKEN: 'TEST_TOKEN', // Habilita geração de link real
    FRONTEND_URL: 'https://universal-scheduler.pages.dev'
};

async function runRealLifecycle() {
    console.log("🚀 INICIANDO TESTE REAL E2E: RICARDO ZACCHI\n");
    const ricardoJid = '5511974150360@s.whatsapp.net';
    const celsoEmail = 'celsosilvajunior90@gmail.com';
    const userInDb = { email: 'zacchiricardo9@gmail.com', name: 'Ricardo Zacchi' };

    // --- PASSO 1: O "OI" (Bem-vindo + Setup de Sessão) ---
    console.log("\n1️⃣ Passo 1: 'Oi' (Boas-vindas)...");
    await handleClientFlow(ricardoJid, "Oi", "oi", null, userInDb, celsoEmail, mockEnv);

    // Buscar a sessão criada
    const sessionRes = await remoteDB.prepare("SELECT * FROM whatsapp_sessions WHERE phone = ?").bind(ricardoJid).first();
    console.log(`[AUDIT] Sessão iniciada: ${sessionRes?.state}`);

    // --- PASSO 2: O AGENDAMENTO (IA + Link Real) ---
    console.log("\n2️⃣ Passo 2: 'Quero agendar...'");
    step = 0; // O mockAI incrementa o step. Vamos alinhar para step 1 ser o booking.
    await handleClientFlow(ricardoJid, "Quero marcar um Corte de Cabelo para amanhã às 14:00", "quero marcar...", sessionRes, userInDb, celsoEmail, mockEnv);

    // Capturar o ID do agendamento criado
    const lastAppt = await remoteDB.prepare("SELECT id FROM appointments WHERE user_email = ? AND status='pending' ORDER BY created_at DESC LIMIT 1").bind(userInDb.email).first();
    lastApptId = lastAppt?.id;
    console.log(`[AUDIT] Agendamento Criado: ${lastApptId}`);

    // --- PASSO 3: O REAGENDAMENTO (Cancelamento + Novo Agendamento) ---
    console.log("\n3️⃣ Passo 3: 'Mude para as 15:00'...");
    const sessionRes2 = await remoteDB.prepare("SELECT * FROM whatsapp_sessions WHERE phone = ?").bind(ricardoJid).first();
    step = 2; // O mockAI fará o passo 3 (reschedule)
    await handleClientFlow(ricardoJid, "Na verdade, mude o horário para as 15:00", "mude o horario...", sessionRes2, userInDb, celsoEmail, mockEnv);

    console.log("\n✅ TESTE REAL FINALIZADO.");
}

runRealLifecycle().catch(console.error);
