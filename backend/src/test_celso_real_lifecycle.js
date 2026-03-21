
import { handleClientFlow } from './bot/clientHandler.js';
import { execSync } from 'child_process';

const sanitizeSql = (sql) => sql.replace(/\s+/g, ' ').trim();

const remoteDB = {
    prepare: (sql) => ({
        bind: (...args) => ({
            run: async () => {
                const cleanSql = sanitizeSql(sql).replace(/\?/g, () => {
                    const arg = args.shift();
                    // ESCAPE FOR SHELL (WINDOWS AND D1)
                    return typeof arg === 'string' ? `'${arg.replace(/'/g, "''")}'` : (arg === null ? 'NULL' : arg);
                });
                console.log(`[SQL EXEC] ${cleanSql}`);
                // Windows shell escaping for double quotes in command
                const shellSql = cleanSql.replace(/"/g, '""'); 
                execSync(`npx wrangler d1 execute barber-db --remote --command="${shellSql}"`, { encoding: 'utf-8', stdio: 'inherit' });
                return { success: true };
            },
            all: async () => {
                const cleanSql = sanitizeSql(sql).replace(/\?/g, () => {
                    const arg = args.shift();
                    return typeof arg === 'string' ? `'${arg.replace(/'/g, "''")}'` : (arg === null ? 'NULL' : arg);
                });
                console.log(`[SQL QUERY] ${cleanSql}`);
                const shellSql = cleanSql.replace(/"/g, '""');
                const output = execSync(`npx wrangler d1 execute barber-db --remote --command="${shellSql}" --json`, { encoding: 'utf-8' });
                const parsed = JSON.parse(output);
                return { results: parsed[0]?.results || [] };
            },
            first: async () => {
                const cleanSql = sanitizeSql(sql).replace(/\?/g, () => {
                    const arg = args.shift();
                    return typeof arg === 'string' ? `'${arg}'` : (arg === null ? 'NULL' : arg);
                });
                console.log(`[SQL FIRST] ${cleanSql}`);
                const output = execSync(`npx wrangler d1 execute barber-db --remote --command="${cleanSql}" --json`, { encoding: 'utf-8' });
                const parsed = JSON.parse(output);
                const res = parsed[0]?.results[0] || null;
                // FIX: Ensure column names are as expected by clientHandler (shop_name, etc)
                return res;
            }
        })
    })
};

let step = 0;
let lastApptId = '';
const mockAI = {
    run: async () => {
        step++;
        // step++;
        
        if (step === 1) { // Booking Tool Call
            return {
                tool_calls: [{
                    id: 'c1',
                    name: 'agendar_cliente',
                    arguments: {
                        user_email: 'celsosilvajunior90@gmail.com',
                        professional_email: 'celsosilvajunior90@gmail.com',
                        service_id: 'corte-simples',
                        date: '2026-03-24', // Terça-feira
                        time: '10:00'
                    }
                }]
            };
        }
        
        if (step === 2) { // Human Response for Booking
            return { 
                response: "Excelente! Agendei seu Corte de Cabelo para Terça-feira (24/03) às 10:00. Segue o link de pagamento: https://universal-scheduler.pages.dev/pay/" + lastApptId
            };
        }

        if (step === 3) { // Rescheduling Tool Calls
            return {
                tool_calls: [
                    { id: 'c2_c', name: 'alterar_status_agendamento', arguments: { appointment_id: lastApptId, status: 'cancelled' } },
                    { id: 'c2_b', name: 'agendar_cliente', arguments: { 
                        user_email: 'celsosilvajunior90@gmail.com', 
                        professional_email: 'celsosilvajunior90@gmail.com', 
                        service_id: 'corte-simples', 
                        date: '2026-03-24', 
                        time: '11:00' 
                    } }
                ]
            };
        }
        
        return { response: "Tudo certo! Mudei seu horário para as 11:00. O novo link de pagamento é: https://universal-scheduler.pages.dev/pay/" + lastApptId };
    }
};

const mockEnv = {
    DB: remoteDB,
    AI: mockAI,
    WA_BRIDGE_KEY: 'universal-secret-key',
    MP_ACCESS_TOKEN: 'sk_live_TEST',
    FRONTEND_URL: 'https://universal-scheduler.pages.dev'
};

async function runCelsoTest() {
    console.log("🚀 INICIANDO TESTE REAL PARA CELSO (SELF-FLOW)\n");
    const celsoJid = '5511972509876@s.whatsapp.net';
    const celsoEmail = 'celsosilvajunior90@gmail.com';
    const userInDb = { email: celsoEmail, name: 'Celso Silva Junior', phone: '11972509876' };

    // 1. OI
    console.log("\n--- PASSO 1: OI ---");
    await handleClientFlow(celsoJid, "Oi", "oi", null, userInDb, celsoEmail, mockEnv);

    // 2. AGENDAR
    console.log("\n--- PASSO 2: AGENDAR ---");
    const session1 = await remoteDB.prepare("SELECT * FROM whatsapp_sessions WHERE phone = ?").bind(celsoJid).first();
    await handleClientFlow(celsoJid, "Quero marcar um Corte amanhã às 10h", "quero agendar...", session1, userInDb, celsoEmail, mockEnv);
    
    // Capturar o ID real
    const appt = await remoteDB.prepare("SELECT id FROM appointments WHERE user_email = ? ORDER BY created_at DESC LIMIT 1").bind(celsoEmail).first();
    lastApptId = appt?.id;

    // 3. REAGENDAR
    console.log("\n--- PASSO 3: REAGENDAR ---");
    // Simulamos a IA respondendo no próximo turno (Step 3 no mock)
    step = 2; // O próximo run fará Step 3
    const session2 = await remoteDB.prepare("SELECT * FROM whatsapp_sessions WHERE phone = ?").bind(celsoJid).first();
    await handleClientFlow(celsoJid, "Mude para as 11:00", "mude para as 11:00", session2, userInDb, celsoEmail, mockEnv);

    console.log("\n✅ TESTE CELSO FINALIZADO.");
}

runCelsoTest();
