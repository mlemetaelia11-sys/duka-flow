"use strict";
function validateProductionEnv(){
    if(process.env.NODE_ENV!=='production')return;
    const m=['DATABASE_HOST','DATABASE_NAME','DATABASE_USER','DATABASE_PASSWORD','JWT_SECRET','APP_URL'].filter(k=>!process.env[k]);
    if((process.env.APP_URL||'').includes('localhost'))m.push('APP_URL(public URL)');
    if((process.env.APP_URL||'').startsWith('http://'))m.push('APP_URL(HTTPS)');
    if((process.env.JWT_SECRET||'').length<32)m.push('JWT_SECRET(32+ chars)');
    if(process.env.REQUIRE_EMAIL_VERIFICATION==='1')for(const k of ['RESEND_API_KEY','RESEND_FROM_EMAIL'])if(!process.env[k])m.push(k);
    if(process.env.ENABLE_AI==='1'||process.env.AI_MODE==='live')if(!process.env.GROQ_API_KEY)m.push('GROQ_API_KEY');
    if(process.env.ENABLE_STORAGE==='1'||process.env.STORAGE_MODE==='live')for(const k of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'])if(!process.env[k])m.push(k);
    if(process.env.ENABLE_PAYMENTS==='1'||process.env.PAYMENTS_MODE==='production'){for(const k of ['PESAPAL_CONSUMER_KEY','PESAPAL_CONSUMER_SECRET'])if(!process.env[k])m.push(k);if(!/^https:\/\//i.test(process.env.PESAPAL_IPN_URL||''))m.push('PESAPAL_IPN_URL(HTTPS)');if(String(process.env.PESAPAL_ENVIRONMENT||'sandbox').toLowerCase()==='production'&&String(process.env.PAYMENTS_MODE||'').toLowerCase()!=='production')m.push('PAYMENTS_MODE=production when PESAPAL_ENVIRONMENT=production');}
    if(process.env.ENABLE_NOTIFICATIONS==='1'||process.env.NOTIFICATIONS_MODE==='live')for(const k of ['FIREBASE_PROJECT_ID','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY'])if(!process.env[k])m.push(k);
    if(process.env.GOOGLE_CLIENT_ID||process.env.GOOGLE_CLIENT_SECRET){for(const k of ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_CALLBACK_URL'])if(!process.env[k])m.push(k);if(process.env.GOOGLE_CALLBACK_URL&&!/^https:\/\//i.test(process.env.GOOGLE_CALLBACK_URL))m.push('GOOGLE_CALLBACK_URL(HTTPS)');}
    if(m.length)throw Error('Production environment is incomplete: '+[...new Set(m)].join(', '));
}
module.exports={validateProductionEnv};
