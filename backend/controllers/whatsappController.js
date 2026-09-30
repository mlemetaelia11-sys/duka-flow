 "use strict";

const crypto=require("crypto");
const pool=require("../db");
const {hash,verifySignature,sendText}=require("../services/whatsapp");
const {processIncoming}=require("../services/whatsappAgent");
const {runWithContext}=require("../requestContext");
const {metaConfiguration,encryptAccessToken,getAccessToken,verifyConnection,exchangeEmbeddedSignupCode,graphVersion}=require("../services/whatsappMeta");

const bid=req=>Number(req.user?.businessId||0);
const branch=req=>Number(req.user?.default_branch_id||req.branchId||0);

async function getAccount(b){
 const r=await pool.query(`SELECT id,business_id,branch_id,phone_number_id,display_phone_number,business_account_id,business_name,access_token,access_token_encrypted,status,connected_at,last_verified_at,is_enabled,ai_enabled,auto_create_orders,human_takeover,welcome_message,last_webhook_at FROM whatsapp_accounts WHERE business_id=$1 ORDER BY id DESC LIMIT 1`,[b]);
 return r.rows[0]||null;
}
function publicAccount(a){if(!a)return null;return {id:a.id,phone_number_id:a.phone_number_id,display_phone_number:a.display_phone_number,business_account_id:a.business_account_id,business_name:a.business_name,status:a.status,connected_at:a.connected_at,last_verified_at:a.last_verified_at,is_enabled:a.is_enabled,ai_enabled:a.ai_enabled,auto_create_orders:a.auto_create_orders,human_takeover:a.human_takeover,welcome_message:a.welcome_message,last_webhook_at:a.last_webhook_at}}
async function settings(req,res){
 const b=bid(req); if(!b)return res.status(401).json({message:"Business context is missing."});
 const a=await getAccount(b);
 if(a?.access_token){try{await getAccessToken(pool,a)}catch{await pool.query(`UPDATE whatsapp_accounts SET status='needs_attention',is_enabled=FALSE,ai_enabled=FALSE,updated_at=NOW() WHERE id=$1 AND business_id=$2`,[a.id,b]);a.status="needs_attention";a.is_enabled=false;a.ai_enabled=false}}
 const meta=metaConfiguration();
 res.json({configured:!!a,account:publicAccount(a),provider:{graphVersion:graphVersion(),appConfigured:!!(process.env.META_APP_SECRET||process.env.WHATSAPP_APP_SECRET),verifyConfigured:!!(process.env.META_WEBHOOK_VERIFY_TOKEN||process.env.WHATSAPP_VERIFY_TOKEN),metaConfigured:meta.ready,metaAppId:meta.appId,metaConfigId:meta.configId}});
}
async function saveSettings(req,res){
 const b=bid(req); if(!b)return res.status(401).json({message:"Business context is missing."});
 const existing=await getAccount(b); if(!existing)return res.status(409).json({message:"Connect WhatsApp with Meta before changing its settings."});
 if(req.body?.accessToken)return res.status(400).json({message:"Reconnect with Meta to update WhatsApp credentials."});
 const auto=req.body?.autoCreateOrders!==false;
 const welcome=String(req.body?.welcomeMessage||"").trim().slice(0,1000)||null;
 await pool.query(`UPDATE whatsapp_accounts SET auto_create_orders=$1,welcome_message=$2,updated_at=NOW() WHERE id=$3 AND business_id=$4`,[auto,welcome,existing.id,b]);
 res.json({message:"WhatsApp settings saved."});
}
async function toggleAgent(req,res){
 const b=bid(req), a=await getAccount(b); if(!a)return res.status(404).json({message:"Connect WhatsApp first."});
 const enabled=Boolean(req.body?.enabled);
 if(enabled&&(a.status!=="connected"||!a.is_enabled))return res.status(409).json({message:"Verify your WhatsApp connection before enabling the AI Agent."});
 await pool.query(`UPDATE whatsapp_accounts SET ai_enabled=$1,updated_at=NOW() WHERE id=$2 AND business_id=$3`,[enabled,a.id,b]);
 res.json({aiEnabled:enabled});
}
async function startConnection(req,res){const config=metaConfiguration();res.json({configured:config.ready,appId:config.appId,configId:config.configId,graphVersion:config.graphVersion,message:config.ready?null:"Meta WhatsApp configuration required"})}
async function connect(req,res){
 const b=bid(req),br=branch(req);if(!b||!br)return res.status(401).json({message:"Business context is missing."});
 const config=metaConfiguration();if(!config.ready)return res.status(503).json({message:"Meta WhatsApp configuration required"});
 let result;try{result=await exchangeEmbeddedSignupCode({code:req.body?.code,wabaId:req.body?.wabaId,phoneNumberId:req.body?.phoneNumberId})}catch{return res.status(400).json({message:"Could not connect WhatsApp. Please try again."})}
 let client;try{
  client=await pool.connect();await client.query("BEGIN");
  await client.query(`UPDATE whatsapp_accounts SET status='disconnected',is_enabled=FALSE,ai_enabled=FALSE,access_token=NULL,access_token_encrypted=NULL,updated_at=NOW() WHERE business_id=$1 AND phone_number_id<>$2 AND status='connected'`,[b,result.phoneNumberId]);
  const encrypted=encryptAccessToken(result.accessToken);
  const saved=await client.query(`INSERT INTO whatsapp_accounts(business_id,branch_id,phone_number_id,display_phone_number,business_account_id,business_name,access_token,access_token_encrypted,status,is_enabled,ai_enabled,connected_at,last_verified_at) VALUES($1,$2,$3,$4,$5,$6,NULL,$7,'connected',TRUE,FALSE,NOW(),NOW()) ON CONFLICT(business_id,phone_number_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,display_phone_number=EXCLUDED.display_phone_number,business_account_id=EXCLUDED.business_account_id,business_name=EXCLUDED.business_name,access_token=NULL,access_token_encrypted=EXCLUDED.access_token_encrypted,status='connected',is_enabled=TRUE,ai_enabled=FALSE,connected_at=NOW(),last_verified_at=NOW(),updated_at=NOW() RETURNING id,phone_number_id,display_phone_number,business_account_id,business_name,status,connected_at,last_verified_at,is_enabled,ai_enabled,auto_create_orders,human_takeover,welcome_message`,[b,br,result.phoneNumberId,result.displayPhoneNumber,result.wabaId,result.businessName,encrypted]);
  await client.query("COMMIT");return res.json({connected:true,account:publicAccount(saved.rows[0])});
 }catch{if(client)try{await client.query("ROLLBACK")}catch{};return res.status(409).json({message:"Could not connect WhatsApp. Please try again."})}finally{client?.release()}
}
async function testConnection(req,res){
 const b=bid(req),a=await getAccount(b);if(!b)return res.status(401).json({message:"Business context is missing."});if(!a||a.status!=="connected")return res.status(404).json({healthy:false,message:"WhatsApp connection needs attention"});
 try{if(a.access_token)await getAccessToken(pool,a);if(!a.access_token_encrypted&&a.access_token)throw new Error("Credential encryption is not configured.");const details=await verifyConnection(a);await pool.query(`UPDATE whatsapp_accounts SET status='connected',is_enabled=TRUE,business_name=COALESCE($1,business_name),display_phone_number=COALESCE($2,display_phone_number),last_verified_at=NOW(),updated_at=NOW() WHERE id=$3 AND business_id=$4`,[details.businessName,details.displayPhoneNumber,a.id,b]);return res.json({healthy:true,message:"WhatsApp connection is healthy"})}catch{await pool.query(`UPDATE whatsapp_accounts SET status='needs_attention',is_enabled=FALSE,ai_enabled=FALSE,updated_at=NOW() WHERE id=$1 AND business_id=$2`,[a.id,b]);return res.json({healthy:false,message:"WhatsApp connection needs attention"})}
}
async function disconnect(req,res){const b=bid(req),a=await getAccount(b);if(!b)return res.status(401).json({message:"Business context is missing."});if(!a)return res.status(404).json({message:"WhatsApp connection not found."});await pool.query(`UPDATE whatsapp_accounts SET status='disconnected',is_enabled=FALSE,ai_enabled=FALSE,access_token=NULL,access_token_encrypted=NULL,updated_at=NOW() WHERE id=$1 AND business_id=$2`,[a.id,b]);return res.json({disconnected:true})}
async function analytics(req,res){
 const b=bid(req); if(!b)return res.status(401).json({message:"Business context is missing."});
 const r=await pool.query(`SELECT
 (SELECT COUNT(*) FROM whatsapp_messages WHERE business_id=$1 AND created_at>=CURRENT_DATE) messages_today,
 (SELECT COUNT(*) FROM whatsapp_conversations WHERE business_id=$1 AND status IN ('open','human')) active_conversations,
 (SELECT COUNT(*) FROM whatsapp_messages WHERE business_id=$1 AND sender_type='ai' AND created_at>=CURRENT_DATE) ai_replies_today,
 (SELECT COUNT(*) FROM whatsapp_orders WHERE business_id=$1 AND status='confirmed' AND created_at>=CURRENT_DATE) orders_today,
 (SELECT COALESCE(SUM(total_amount),0) FROM whatsapp_orders WHERE business_id=$1 AND status='confirmed' AND created_at>=CURRENT_DATE) revenue_today,
 (SELECT COUNT(*) FROM whatsapp_contacts WHERE business_id=$1 AND created_at>=CURRENT_DATE) new_contacts_today`,[b]);
 res.json({analytics:r.rows[0]});
}
async function conversations(req,res){
 const b=bid(req); if(!b)return res.status(401).json({message:"Business context is missing."});
 const r=await pool.query(`SELECT c.id,c.wa_id,c.name,c.phone,c.human_takeover,v.id conversation_id,v.status,v.ai_enabled,v.last_message_at,(SELECT body FROM whatsapp_messages m WHERE m.conversation_id=v.id ORDER BY m.id DESC LIMIT 1) last_message FROM whatsapp_contacts c JOIN whatsapp_conversations v ON v.contact_id=c.id WHERE c.business_id=$1 ORDER BY v.last_message_at DESC LIMIT 100`,[b]);
 res.json({conversations:r.rows});
}
async function messages(req,res){
 const b=bid(req),id=Number(req.params.id); if(!b||!id)return res.status(400).json({message:"Conversation is required."});
 const r=await pool.query(`SELECT id,direction,sender_type,message_type,body,status,created_at FROM whatsapp_messages WHERE business_id=$1 AND conversation_id=$2 ORDER BY id ASC LIMIT 300`,[b,id]);
 res.json({messages:r.rows});
}
async function takeover(req,res){
 const b=bid(req),id=Number(req.params.id); if(!b||!id)return res.status(400).json({message:"Conversation is required."});
 const on=Boolean(req.body?.human);
 await pool.query(`UPDATE whatsapp_contacts SET human_takeover=$1,updated_at=NOW() WHERE business_id=$2 AND id=(SELECT contact_id FROM whatsapp_conversations WHERE business_id=$2 AND id=$3)`,[on,b,id]);
 await pool.query(`UPDATE whatsapp_conversations SET status=$1,ai_enabled=$2,updated_at=NOW() WHERE business_id=$3 AND id=$4`,[on?"human":"open",!on,b,id]);
 res.json({humanTakeover:on});
}
async function sendHuman(req,res){
 const b=bid(req),id=Number(req.params.id),body=String(req.body?.message||"").trim(); if(!b||!id||!body)return res.status(400).json({message:"Conversation and message are required."});
 const r=await pool.query(`SELECT a.id,a.business_id,a.phone_number_id,a.access_token,a.access_token_encrypted,a.status,a.is_enabled,c.wa_id FROM whatsapp_conversations v JOIN whatsapp_accounts a ON a.id=v.account_id JOIN whatsapp_contacts c ON c.id=v.contact_id WHERE v.business_id=$1 AND v.id=$2 LIMIT 1`,[b,id]);
 if(!r.rowCount)return res.status(404).json({message:"Conversation not found."});
 const x=r.rows[0];if(x.status!=="connected"||!x.is_enabled)return res.status(409).json({message:"WhatsApp is disconnected."});const accessToken=await getAccessToken(pool,x);await sendText({phoneNumberId:x.phone_number_id,accessToken,to:x.wa_id,body});
 await pool.query(`INSERT INTO whatsapp_messages(business_id,conversation_id,direction,sender_type,message_type,body,payload,status) VALUES($1,$2,'outbound','human','text',$3,'{}','sent')`,[b,id,body]);
 res.json({ok:true});
}
async function webhookVerify(req,res){
 const mode=String(req.query?.["hub.mode"]||""), token=String(req.query?.["hub.verify_token"]||""), challenge=String(req.query?.["hub.challenge"]||"");
 const expected=String(process.env.META_WEBHOOK_VERIFY_TOKEN||process.env.WHATSAPP_VERIFY_TOKEN||"").trim();
 if(mode==="subscribe"&&expected&&token===expected)return res.status(200).send(challenge);
 return res.sendStatus(403);
}
async function webhook(req,res){
 const signature=req.get("x-hub-signature-256"), secret=String(process.env.META_APP_SECRET||process.env.WHATSAPP_APP_SECRET||"");
 if(!secret)return res.sendStatus(503);
 if(!req.rawBody||!verifySignature(req.rawBody,signature,secret))return res.sendStatus(403);
 res.sendStatus(200);
 try{
   const entries=Array.isArray(req.body?.entry)?req.body.entry:[];
   for(const entry of entries){
     const changes=Array.isArray(entry.changes)?entry.changes:[];
     for(const change of changes){
       const value=change.value||{}, metadata=value.metadata||{}, phoneId=String(metadata.phone_number_id||"");
       if(!phoneId)continue;
      const ar=await pool.webhookQuery(`SELECT * FROM whatsapp_accounts WHERE phone_number_id=$1 AND is_enabled=TRUE AND status='connected' LIMIT 1`,[phoneId],phoneId);
      if(!ar.rowCount)continue; const account=ar.rows[0];
       await runWithContext({businessId:Number(account.business_id),branchId:Number(account.branch_id),userId:null}, async()=> {
      account.access_token=await getAccessToken(pool,account);
      if(!account.access_token)return;
       await pool.query(`UPDATE whatsapp_accounts SET last_webhook_at=NOW() WHERE id=$1`,[account.id]);
       const msgs=Array.isArray(value.messages)?value.messages:[];
       for(const msg of msgs){
         if(msg.type!=="text"||!msg.from)continue;
         const waId=String(msg.from), name=String(value.contacts?.find(x=>x.wa_id===waId)?.profile?.name||"WhatsApp Customer").slice(0,160);
         let cr=await pool.query(`SELECT * FROM whatsapp_contacts WHERE account_id=$1 AND wa_id=$2 LIMIT 1`,[account.id,waId]);
         let contact;
         if(cr.rowCount) contact=cr.rows[0]; else {
           const customer=await pool.query(`SELECT id FROM customers WHERE business_id=$1 AND RIGHT(regexp_replace(COALESCE(phone,''),'\\D','','g'),9)=RIGHT(regexp_replace($2,'\\D','','g'),9) LIMIT 1`,[account.business_id,waId]);
           contact=(await pool.query(`INSERT INTO whatsapp_contacts(business_id,account_id,wa_id,phone,name,customer_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[account.business_id,account.id,waId,waId,name,customer.rows[0]?.id||null])).rows[0];
         }
         let vr=await pool.query(`SELECT * FROM whatsapp_conversations WHERE account_id=$1 AND contact_id=$2 LIMIT 1`,[account.id,contact.id]);
         let conversation=vr.rows[0];
         if(!conversation)conversation=(await pool.query(`INSERT INTO whatsapp_conversations(business_id,account_id,contact_id) VALUES($1,$2,$3) RETURNING *`,[account.business_id,account.id,contact.id])).rows[0];
         const duplicate=msg.id?await pool.query(`SELECT id FROM whatsapp_messages WHERE wa_message_id=$1 LIMIT 1`,[msg.id]):{rowCount:0};
         if(duplicate.rowCount)continue;
         const body=String(msg.text?.body||"").trim(); if(!body)continue;
         await pool.query(`INSERT INTO whatsapp_messages(business_id,conversation_id,wa_message_id,direction,sender_type,message_type,body,payload) VALUES($1,$2,$3,'inbound','customer','text',$4,$5)`,[account.business_id,conversation.id,msg.id||null,body,JSON.stringify(msg)]);
         await pool.query(`UPDATE whatsapp_conversations SET last_message_at=NOW(),updated_at=NOW() WHERE id=$1`,[conversation.id]);
         await processIncoming({account,contact,conversation,body});
       }
       });
     }
   }
 }catch(e){console.error("WHATSAPP WEBHOOK PROCESSING ERROR:",String(e?.message||"Processing failed."));}
}
module.exports={settings,saveSettings,toggleAgent,startConnection,connect,testConnection,disconnect,analytics,conversations,messages,takeover,sendHuman,webhookVerify,webhook};
