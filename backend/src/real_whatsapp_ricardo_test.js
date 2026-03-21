
import { sendMessage } from './utils/index.js';

const mockEnv = {
    WA_BRIDGE_KEY: 'universal-secret-key',
    DB: null // Not needed for direct sendMessage if we override URL
};

const ricardoPhone = '11974150360';
const celsoEmail = 'celsosilvajunior90@gmail.com';
const bridgeUrl = 'https://nisi-marbly-maeve.ngrok-free.dev';

async function runRealTest() {
    console.log("🚀 INICIANDO TESTE REAL DE WHATSAPP (VIA BRIDGE)\n");
    console.log(`👤 Destinatário: Ricardo Zacchi (${ricardoPhone})`);
    console.log(`📡 Usando Bridge: ${bridgeUrl}`);

    const message = `✨ *TESTE DE AGENDAMENTO REAL* ✨\n\nOlá Ricardo! Sou o assistente da *Barbearia do Celso*.\n\nPara confirmar, o seu agendamento de *Corte de Cabelo* ficou para **Segunda-feira (23/03) às 15:00**.\n\nAqui está o seu link de pagamento: https://universal-scheduler.pages.dev/pay/real_test_001\n\nNos vemos lá! 💈`;

    console.log("\n💬 Enviando mensagem...");
    try {
        // Usamos a função real do projeto
        await sendMessage(mockEnv, ricardoPhone, message, celsoEmail, bridgeUrl);
        console.log("\n✅ PEDIDO DE ENVIO REALIZADO COM SUCESSO.");
        console.log("Verifique o terminal da BRIDGE para o status final.");
    } catch (e) {
        console.error("\n❌ FALHA NO ENVIO:", e.message);
    }
}

runRealTest();
