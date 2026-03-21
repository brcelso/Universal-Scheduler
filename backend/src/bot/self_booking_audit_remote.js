
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
                    return typeof arg === 'string' ? `'${arg}'` : arg;
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
                    return typeof arg === 'string' ? `'${arg}'` : arg;
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
                    return typeof arg === 'string' ? `'${arg}'` : arg;
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

// Deterministic Mock AI for Testing Logic Flow
const mockAI = {
    run: async (model, { messages, tools }) => {
        console.log(`[AI DECISION] Model: ${model}`);
        const lastMsg = messages[messages.length - 1].content.toLowerCase();
        
        // Simulação de decisão inteligente baseada no prompt
        if (lastMsg.includes("agendar") && lastMsg.includes("corte")) {
            console.log(`[AI DECISION] Reconhecido desejo de agendamento. Chamando 'agendar_cliente'...`);
            // Calculamos a data de amanhã para a simulação
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateStr = tomorrow.toISOString().split('T')[0];
            
            return {
                tool_calls: [{
                    id: 'call_123',
                    name: 'agendar_cliente',
                    arguments: {
                        user_email: 'celsosilvajunior90@gmail.com',
                        professional_email: 'celsosilvajunior90@gmail.com',
                        service_id: 'corte-simples',
                        date: dateStr,
                        time: '10:00'
                    }
                }]
            };
        }
        
        return { response: "Agendamento realizado com sucesso para você, Celso!" };
    }
};

const mockEnv = { DB: remoteDB, AI: mockAI, MP_ACCESS_TOKEN: 'test', FRONTEND_URL: 'http://localhost:5173' };

async function runAudit() {
    console.log("🕵️ INICIANDO AUDITORIA DE AUTO-AGENDAMENTO (REMOTO)\n");
    console.log("👤 Usuário: Celso (celsosilvajunior90@gmail.com)");
    console.log("💬 Mensagem: 'Agendar um Corte de Cabelo para mim amanhã às 10:00'");
    
    try {
        const result = await runAgentChat(mockEnv, {
            prompt: "Agendar um Corte de Cabelo para mim amanhã às 10:00",
            userEmail: "celsosilvajunior90@gmail.com",
            isAdmin: true,
            professionalContext: {
                professionalEmail: "celsosilvajunior90@gmail.com",
                name: "Celso Master",
                shop_name: "Barbearia do Celso",
                isMaster: true
            }
        });

        console.log("\n✅ RESPOSTA FINAL DA IA:");
        console.log(result.text);
        
        console.log("\n✨ TESTE COMPLETO.");
    } catch (e) {
        console.error("\n❌ FALHA NO TESTE:", e.message);
    }
}

runAudit();
