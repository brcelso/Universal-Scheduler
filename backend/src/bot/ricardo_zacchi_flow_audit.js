
import { runAgentChat } from './agent.js';
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
                } catch (e) {
                    return { success: false, error: e.message };
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
                } catch (e) {
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
                } catch (e) {
                    return null;
                }
            }
        })
    })
};

// Mock AI with deterministic multi-step behavior
let step = 0;
let lastApptId = '';

const mockAI = {
    run: async (model, { messages }) => {
        const lastMsg = messages[messages.length - 1].content.toLowerCase();
        step++;
        console.log(`\n[STEP ${step}] AI Input: "${lastMsg.substring(0, 50)}..."`);

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
        
        if (step === 2) { // Refinement after booking (Payment Link)
            return {
                response: "Excelente, Ricardo! Seu Corte de Cabelo está agendado para amanhã às 14:00. Aqui está o seu link de pagamento: http://pagamento.com/test"
            };
        }

        if (step === 3) { // Rescheduling
            return {
                tool_calls: [
                    {
                        id: 'c2_cancel',
                        name: 'alterar_status_agendamento',
                        arguments: {
                            appointment_id: lastApptId, 
                            status: 'cancelled'
                        }
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

        return { response: "Tudo pronto e alterado para as 15:00!" };
    }
};

const mockEnv = { DB: remoteDB, AI: mockAI, MP_ACCESS_TOKEN: 'sk_test_123', FRONTEND_URL: 'http://localhost:5173' };

async function runRicardoFlow() {
    console.log("🚀 INICIANDO AUDITORIA E2E: RICARDO ZACCHI\n");

    // 1. AGENDAMENTO
    console.log("--- FASE 1: AGENDAMENTO ---");
    const bookResult = await runAgentChat(mockEnv, {
        prompt: "Quero agendar um Corte de Cabelo para amanhã às 14:00",
        userEmail: "zacchiricardo9@gmail.com",
        isAdmin: false,
        professionalContext: { professionalEmail: "celsosilvajunior90@gmail.com", establishmentName: "Barbearia do Celso" }
    });
    console.log("AI Response:", bookResult.text);
    
    // EXTRAIR ID DO RESULTADO DA FERRAMENTA
    const toolRes = bookResult.tool_results?.find(r => r.name === 'agendar_cliente');
    if (toolRes) {
        const data = JSON.parse(toolRes.content);
        lastApptId = data.id;
        console.log(`[AUDIT] Agendamento Criado: ${lastApptId}`);
    }

    // 2. REAGENDAMENTO
    console.log("\n--- FASE 2: REAGENDAMENTO ---");
    // Resetando o step para simular nova interação de reagendamento
    step = 2; 
    const reschedResult = await runAgentChat(mockEnv, {
        prompt: "Na verdade, mude o meu horário das 14:00 para as 15:00",
        userEmail: "zacchiricardo9@gmail.com",
        isAdmin: false,
        professionalContext: { professionalEmail: "celsosilvajunior90@gmail.com", establishmentName: "Barbearia do Celso" },
        history: [{ role: 'assistant', content: bookResult.text }]
    });
    console.log("AI Response:", reschedResult.text);

    console.log("\n✨ FLUXO FINALIZADO. Verificando DB...");
    const finalCheck = execSync(`npx wrangler d1 execute barber-db --remote --command="SELECT * FROM appointments WHERE user_email = 'zacchiricardo9@gmail.com'"` , { encoding: 'utf-8' });
    console.log(finalCheck);
}

runRicardoFlow().catch(console.error);
