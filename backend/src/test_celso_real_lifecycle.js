import 'dotenv/config'; 
import { handleClientFlow } from './bot/clientHandler.js';
import { createMPPreference } from './utils/paymentUtils.js';
import { execSync } from 'child_process';

// --- VALIDAÇÃO DE SEGURANÇA ---
if (!process.env.TEST_USER_EMAIL || !process.env.MP_ACCESS_TOKEN) {
    console.error("❌ ERRO: Variáveis de ambiente não carregadas. Verifique seu arquivo .env");
    process.exit(1);
}

const DB_NAME = process.env.D1_DB_NAME || 'barber-db';

// --- UTILITÁRIOS DE BANCO REMOTO (CORRIGIDO PARA WINDOWS/NODE 24) ---
const sanitizeSql = (sql) => sql.replace(/\s+/g, ' ').trim();

const executeSql = (sql, args, mode = 'run') => {
    let argIndex = 0;
    const cleanSql = sanitizeSql(sql).replace(/\?/g, () => {
        const arg = args[argIndex++];
        // Tratamento crucial: se for undefined, vira NULL para não quebrar o SQL
        if (arg === undefined) return 'NULL';
        return typeof arg === 'string' ? `'${arg.replace(/'/g, "''")}'` : arg;
    });

    console.log(`[SQL ${mode.toUpperCase()}] ${cleanSql}`);
    
    try {
        // Usamos stdio: ['ignore', 'pipe', 'ignore'] para evitar o crash de Assertion do Windows
        const command = `npx wrangler d1 execute ${DB_NAME} --remote --command="${cleanSql.replace(/"/g, '""')}" --json`;
        const output = execSync(command, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        
        if (mode === 'run') return { success: true };
        
        const parsed = JSON.parse(output);
        const results = parsed[0]?.results || [];
        return mode === 'first' ? (results[0] || null) : { results };
    } catch (err) {
        console.error(`❌ Falha no comando SQL. Verifique se a coluna existe no D1.`);
        return mode === 'first' ? null : { results: [] };
    }
};

const remoteDB = {
    prepare: (sql) => ({
        bind: (...args) => ({
            run: async () => executeSql(sql, args, 'run'),
            all: async () => executeSql(sql, args, 'all'),
            first: async () => executeSql(sql, args, 'first')
        })
    })
};

// --- MOCK DA IA ---
let step = 0;

const mockAI = {
    run: async () => {
        step++;
        const email = process.env.TEST_USER_EMAIL;
        
        if (step === 1) {
            return {
                tool_calls: [{
                    id: 'c1',
                    name: 'agendar_cliente',
                    arguments: {
                        user_email: email,
                        professional_email: email,
                        service_id: 'corte-simples',
                        date: '2026-03-24',
                        time: '10:00'
                    }
                }]
            };
        }
        
        if (step === 2) {
            console.log("\n🔗 [PAGAMENTO] Buscando dados para gerar link...");
            const appt = await remoteDB.prepare(`
                SELECT a.id, a.appointment_date, a.appointment_time, s.name as service_name 
                FROM appointments a 
                JOIN services s ON a.service_id = s.id 
                WHERE a.user_email = ? 
                ORDER BY a.created_at DESC LIMIT 1
            `).bind(email).first();

            if (!appt) return { response: "Ops, não encontrei seu agendamento para gerar o pagamento." };

            const mpResult = await createMPPreference(mockEnv, remoteDB, appt.id);
            const linkReal = mpResult.paymentUrl || "⚠️ Link temporariamente indisponível";
            
            const dataPartes = appt.appointment_date.split('-');
            const dataFormatada = `${dataPartes[2]}/${dataPartes[1]}`;

            return { 
                response: `✅ *Agendamento Confirmado!*\n\n` +
                          `*Serviço:* ${appt.service_name}\n` +
                          `*Data:* ${dataFormatada}\n` +
                          `*Horário:* ${appt.appointment_time}h\n\n` +
                          `Clique no link abaixo para finalizar o pagamento:\n🔗 ${linkReal}`
            };
        }
        
        return { response: "Processo concluído." };
    }
};

// --- CONFIGURAÇÃO DO AMBIENTE ---
const mockEnv = {
    DB: remoteDB,
    AI: mockAI,
    WA_BRIDGE_KEY: process.env.WA_BRIDGE_KEY,
    WA_BRIDGE_URL: process.env.WA_BRIDGE_URL,
    MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN,
    FRONTEND_URL: process.env.FRONTEND_URL,
    
    sendMessage: async (env, to, text, professionalEmail) => {
        console.log(`\n[BRIDGE SEND] Enviando para ${to}...`);
        try {
            const res = await fetch(`${env.WA_BRIDGE_URL}/send`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${env.WA_BRIDGE_KEY}`,
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ to, text, professionalEmail })
            });
            return await res.json();
        } catch (err) {
            console.error(`[BRIDGE ERROR] ${err.message}`);
        }
    }
};

async function runCelsoTest() {
    const jid = process.env.TEST_USER_JID;
    const email = process.env.TEST_USER_EMAIL;
    const userInDb = { email, name: 'Celso Silva Junior', phone: jid.split('@')[0] };

    console.log("🚀 INICIANDO TESTE REAL (D1 + MERCADO PAGO)\n");

    console.log("--- PASSO 1: AGENDAR ---");
    // Passando o email como professionalEmail para a busca de configurações inicial
    await handleClientFlow(jid, "Quero agendar um corte", "agendar", null, userInDb, email, mockEnv);

    console.log("\n--- PASSO 2: GERAR CONFIRMAÇÃO E LINK ---");
    const session = await remoteDB.prepare("SELECT * FROM whatsapp_sessions WHERE phone = ?").bind(jid).first();
    await handleClientFlow(jid, "Confirmar", "ok", session, userInDb, email, mockEnv);

    console.log("\n✅ TESTE FINALIZADO COM SUCESSO.");
}

runCelsoTest();