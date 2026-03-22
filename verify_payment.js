/**
 * Verify Payment Link Generation
 */
import { createMPPreference } from './backend/src/utils/paymentUtils.js';

const mockEnv = {
    MP_ACCESS_TOKEN: 'APP_USR-1253235899009881-021420-881c35d24b04f32cf875035eeb71fe77-124280008',
    FRONTEND_URL: 'https://brcelso.github.io/Universal-Scheduler/'
};

const mockDB = {
    prepare: () => ({
        bind: () => ({
            first: async () => ({
                id: 'appt_1774136123317',
                barber_email: 'celsosilvajunior90@gmail.com',
                service_name: 'Corte de Cabelo',
                price: 70
            })
        })
    })
};

async function test() {
    console.log('🔍 Testando geração de link de pagamento...');
    const res = await createMPPreference(mockEnv, mockDB, 'appt_1774136123317');
    console.log('Resultado:', res);
}

test();
