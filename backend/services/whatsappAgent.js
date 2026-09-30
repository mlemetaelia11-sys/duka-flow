"use strict";

const pool = require("../db");
const { chat } = require("./groq");
const { sendText } = require("./whatsapp");

const tool = (name, description, properties={}) => ({
    type:"function", function:{name,description,parameters:{type:"object",properties,additionalProperties:false}}
});
const tools = [
    tool("search_products","Find products by name, SKU or barcode and return current stock and price.",{query:{type:"string"},limit:{type:"integer",minimum:1,maximum:10}}),
    tool("find_customer","Find the WhatsApp customer record.",{query:{type:"string"}}),
    tool("create_order","Create a confirmed WhatsApp order/sale. Only call when the customer has clearly confirmed the items and payment method.",{
        items:{type:"array",items:{type:"object",properties:{productId:{type:"integer"},quantity:{type:"integer"}},required:["productId","quantity"]}},
        paymentMethod:{type:"string",enum:["cash","mobile_money","credit"]},
        note:{type:"string"}
    }),
    tool("get_order_status","Return the latest order for this WhatsApp conversation.",{})
];

async function lookup(n,args,bid,conversationId,contactId,accountId){
    if(n==="search_products"){
        const q=String(args?.query||"").trim(), limit=Math.min(Math.max(Number(args?.limit)||6,1),10);
        const r=await pool.query(`SELECT id,name,sku,barcode,stock_quantity,selling_price,unit FROM products WHERE business_id=$1 AND (name ILIKE '%'||$2||'%' OR COALESCE(sku,'') ILIKE '%'||$2||'%' OR COALESCE(barcode,'') ILIKE '%'||$2||'%') ORDER BY stock_quantity>0 DESC,name LIMIT $3`,[bid,q,limit]);
        return r.rows;
    }
    if(n==="find_customer"){
        const q=String(args?.query||"").trim();
        const r=await pool.query(`SELECT id,name,phone,email FROM customers WHERE business_id=$1 AND (name ILIKE '%'||$2||'%' OR COALESCE(phone,'') ILIKE '%'||$2||'%') ORDER BY name LIMIT 5`,[bid,q]);
        if(r.rows[0]) await pool.query(`UPDATE whatsapp_contacts SET customer_id=$1,updated_at=NOW() WHERE id=$2 AND business_id=$3`,[r.rows[0].id,contactId,bid]);
        return r.rows;
    }
    if(n==="get_order_status"){
        const r=await pool.query(`SELECT id,status,total_amount,items,created_at,sale_id FROM whatsapp_orders WHERE business_id=$1 AND conversation_id=$2 ORDER BY id DESC LIMIT 3`,[bid,conversationId]);
        return r.rows;
    }
    if(n==="create_order"){
        const items=Array.isArray(args?.items)?args.items:[]; if(!items.length) throw Error("Order must contain at least one item.");
        const method=["cash","mobile_money","credit"].includes(args?.paymentMethod)?args.paymentMethod:"cash";
        const client=await pool.connect();
        try{
            await client.query("BEGIN");
            const prepared=[]; let subtotal=0;
            for(const raw of items){
                const id=Number(raw.productId), qty=Number(raw.quantity);
                if(!Number.isInteger(id)||!Number.isInteger(qty)||qty<1) throw Error("Invalid order item.");
                const r=await client.query(`SELECT id,name,buying_price,selling_price,stock_quantity FROM products WHERE business_id=$1 AND id=$2 FOR UPDATE`,[bid,id]);
                if(!r.rowCount) throw Error("One of the requested products was not found.");
                const p=r.rows[0]; if(Number(p.stock_quantity)<qty) throw Error(`${p.name} has only ${p.stock_quantity} in stock.`);
                const line=Number(p.selling_price)*qty; subtotal+=line;
                prepared.push({productId:id,name:p.name,quantity:qty,buyingPrice:Number(p.buying_price),sellingPrice:Number(p.selling_price),lineTotal:line,profitAmount:(Number(p.selling_price)-Number(p.buying_price))*qty});
            }
            const receipt=(await client.query(`SELECT 'DF-'||TO_CHAR(NOW(),'YYYYMMDD')||'-'||LPAD(nextval('sales_receipt_seq')::text,6,'0') receipt_number`)).rows[0].receipt_number;
            const customerId=(await client.query(`SELECT customer_id FROM whatsapp_contacts WHERE id=$1 AND business_id=$2`,[contactId,bid])).rows[0]?.customer_id||null;
            if(method==='credit' && !customerId) throw Error("Please provide your customer name or phone before choosing credit.");
            const paid=method==='credit'?0:subtotal, status=method==='credit'?'credit':'paid';
            const sale=(await client.query(`INSERT INTO sales(receipt_number,business_id,customer_id,created_by,subtotal,discount,total_amount,payment_method,amount_paid,change_amount,status) VALUES($1,$2,$3,NULL,$4,0,$4,$5,$6,0,$7) RETURNING id,receipt_number,total_amount`,[receipt,bid,customerId,subtotal,method,paid,status])).rows[0];
            if(method==='credit'){
                await client.query(`INSERT INTO debts(business_id,sale_id,customer_id,total_amount,amount_paid,balance,status) VALUES($1,$2,$3,$4,0,$4,'unpaid')`,[bid,sale.id,customerId,subtotal]);
            }
            for(const p of prepared){
                await client.query(`INSERT INTO sale_items(business_id,sale_id,product_id,product_name,quantity,unit_price,buying_price,line_total,profit_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[bid,sale.id,p.productId,p.name,p.quantity,p.sellingPrice,p.buyingPrice,p.lineTotal,p.profitAmount]);
                await client.query(`UPDATE products SET stock_quantity=stock_quantity-$1,updated_at=NOW() WHERE business_id=$2 AND id=$3`,[p.quantity,bid,p.productId]);
                await client.query(`INSERT INTO stock_movements(business_id,product_id,movement_type,quantity_change,reference_type,reference_id,notes) VALUES($1,$2,'sale',$3,'sale',$4,$5)`,[bid,p.productId,-p.quantity,sale.id,`WhatsApp order ${receipt}`]);
            }
            const order=(await client.query(`INSERT INTO whatsapp_orders(business_id,conversation_id,sale_id,status,items,total_amount,customer_note) VALUES($1,$2,$3,'confirmed',$4,$5,$6) RETURNING id,status,total_amount`,[bid,conversationId,sale.id,JSON.stringify(prepared),subtotal,args.note||null])).rows[0];
            await client.query("COMMIT");
            return {orderId:order.id,receiptNumber:sale.receipt_number,total:Number(order.total_amount),paymentMethod:method,items:prepared};
        }catch(e){try{await client.query("ROLLBACK")}catch{};throw e}finally{client.release()}
    }
    throw Error("Unknown WhatsApp tool.");
}

async function processIncoming({account,contact,conversation,body}){
    const bid=Number(account.business_id), cid=Number(conversation.id);
    if(account.status!=="connected" || !account.is_enabled || contact.human_takeover || conversation.status==="human" || !account.ai_enabled || !conversation.ai_enabled) return null;
    if(!process.env.GROQ_API_KEY)return null;
    const history=(await pool.query(`SELECT direction,sender_type,body FROM whatsapp_messages WHERE business_id=$1 AND conversation_id=$2 ORDER BY id DESC LIMIT 16`,[bid,cid])).rows.reverse();
    const prompt=[{role:"system",content:`You are DukaFlow WhatsApp Sales Agent for ${account.display_phone_number||"this business"}. Sell politely in Swahili unless the customer writes English. Never invent products, stock or prices. Search products before quoting. When customer confirms an order, create it with the exact product IDs and quantities. Payment methods are cash, mobile_money or credit. For credit, ask for confirmation and customer identity before creating. Keep replies concise and WhatsApp-friendly. Do not claim an order was created unless create_order succeeds.`},...history.map(x=>({role:x.sender_type==="customer"?"user":"assistant",content:x.body||""}))];
    if(process.env.GROQ_API_KEY){
        let r=await chat({messages:prompt,tools,temperature:0.2});
        let m=r.choices?.[0]?.message;
        for(let round=0;round<3&&m?.tool_calls?.length;round++){
            prompt.push({role:"assistant",content:m.content||"",tool_calls:m.tool_calls});
            for(const call of m.tool_calls){
                let args={};try{args=JSON.parse(call.function.arguments||"{}")}catch{}
                let result; try{result=await lookup(call.function.name,args,bid,cid,contact.id,account.id)}catch(e){result={error:e.message}}
                prompt.push({role:"tool",tool_call_id:call.id,name:call.function.name,content:JSON.stringify(result)});
            }
            r=await chat({messages:prompt,tools,temperature:0.2});m=r.choices?.[0]?.message;
        }
        const rawAnswer=String(m?.content||"Samahani, sijaweza kupata jibu kwa sasa.");
        const answer=String(account.welcome_message && history.length===1 ? `${account.welcome_message}\n\n${rawAnswer}` : rawAnswer).slice(0,4096);
        await pool.query(`INSERT INTO whatsapp_messages(business_id,conversation_id,direction,sender_type,message_type,body,payload) VALUES($1,$2,'outbound','ai','text',$3,'{}')`,[bid,cid,answer]);
        await pool.query(`UPDATE whatsapp_conversations SET last_message_at=NOW(),updated_at=NOW() WHERE id=$1 AND business_id=$2`,[cid,bid]);
        await sendText({phoneNumberId:account.phone_number_id,accessToken:account.access_token,to:contact.wa_id,body:answer});
        return answer;
    }
}
module.exports={processIncoming};
