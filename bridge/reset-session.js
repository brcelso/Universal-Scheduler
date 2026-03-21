const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🛑 Resetando Sessões do WhatsApp...');

try {
    // 1. Tentar matar processos node no Windows que possam estar travando a pasta
    console.log('⏳ Garantindo que nenhum processo está travando a pasta...');
    try {
        execSync('taskkill /F /IM node.exe /T', { stdio: 'ignore' });
    } catch (e) {
        // Ignorar se não houver processos
    }

    // 2. Remover a pasta de sessões
    const authFolder = path.join(__dirname, 'auth_sessions');
    if (fs.existsSync(authFolder)) {
        console.log('🗑️ Removendo pasta auth_sessions...');
        fs.rmSync(authFolder, { recursive: true, force: true });
        console.log('✅ Pasta removida com sucesso.');
    } else {
        console.log('ℹ️ Nenhuma sessão encontrada para remover.');
    }

    // 3. Remover flag de parada se existir
    const stopFlag = path.join(__dirname, '.stop-flag');
    if (fs.existsSync(stopFlag)) {
        fs.unlinkSync(stopFlag);
    }

    console.log('\n✨ Reset concluído! Agora você pode rodar "node manage.js" novamente.');
} catch (error) {
    console.error('❌ Erro durante o reset:', error.message);
    console.log('Tente fechar manualmente todos os terminais e excluir a pasta "bridge/auth_sessions".');
}
