import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const base = 'http://localhost:18080';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.includes('=') && !line.startsWith('#')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
async function call(path, {method='GET', body, headers={}, expected=200}={}) {
 const response = await fetch(base + path, {method, redirect:'manual', headers:{...headers, ...(body ? {'Content-Type':'application/json'} : {})}, body:body ? JSON.stringify(body) : undefined});
 assert.ok([expected].flat().includes(response.status), `${method} ${path.split('?')[0]} returned ${response.status}`);
 return response;
}
const login = await (await call('/api/admin/login',{method:'POST',body:{username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD}})).json();
const admin = {Authorization:`Bearer ${login.access_token}`};
const existing = await (await call('/api/admin/access',{headers:admin})).json();
const numbers = Array.from({length:500},(_,i)=>i+1).filter(n=>!existing.tables.some(t=>t.number===n));
async function device(number, existingTable) {
 const table = existingTable || await (await call('/api/admin/tables',{method:'POST',headers:admin,body:{number}})).json();
 const pc = await (await call('/api/admin/pcs',{method:'POST',headers:admin,body:{table_id:table.id,name:'Access verification'}})).json();
 assert.ok(!pc.device_secret);
 const enrollment = await (await call('/api/pc/enroll',{method:'POST',body:{code:pc.enrollment_code}})).json();
 await call('/api/pc/enroll',{method:'POST',body:{code:pc.enrollment_code},expected:403});
 const headers={Authorization:`Device ${enrollment.device_secret}`};
 const token = await (await call('/api/pc/qr-token',{headers})).json();
 assert.ok(!token.order_url.includes(enrollment.device_secret));
 return {table, pc, token, headers};
}
const a=await device(numbers[0]), b=await device(numbers[1]), sibling=await device(numbers[0],a.table);
const floor = async () => (await call('/api/admin/floor',{headers:admin})).json();
const tableBill = async (number) => (await call(`/api/admin/floor/${number}`,{headers:admin})).json();
const flag = (number, body, expected=204, headers=admin) =>
 call(`/api/admin/floor/${number}/flag`,{method:'PATCH',headers,body,expected});
const close = (number, bill, expected=204, headers=admin) =>
 call(`/api/admin/floor/${number}/close`,{method:'POST',headers,expected,body:{
  version:bill.version,order_ids:bill.orders.map(order=>order.id),
 }});
await call('/api/admin/floor',{expected:401});
assert.equal((await floor()).find(table=>table.number===a.table.number).order_count,0);
const manualTable = numbers[2];
assert.equal((await tableBill(manualTable)).version,null);
await flag(manualTable,{version:null,flagged:true});
assert.equal((await floor()).find(table=>table.number===manualTable).flagged,true);
const manualBill = await tableBill(manualTable);
await flag(manualTable,{version:manualBill.version,flagged:false});
assert.equal((await tableBill(manualTable)).flagged,false);
await close(manualTable,manualBill,409);
assert.equal((await tableBill(manualTable)).version,manualBill.version);
await flag(manualTable,{version:manualBill.version,flagged:true});
await close(manualTable,manualBill);
assert.equal((await tableBill(manualTable)).flagged,false);
await call('/api/pc/status',{headers:a.headers});
await call('/',{});
await call('/order',{expected:403});
await call('/api/menu',{expected:401});
await call('/api/orders',{method:'POST',body:{items:[]},expected:401});
await call('/api/guest-session',{method:'POST',expected:404});
await call(`/order?table=${b.table.id}&t=${a.token.temp_token}`,{expected:403});
async function enter(token) {
 const response=await call(new URL(token.order_url).pathname+new URL(token.order_url).search,{expected:303});
 assert.equal(response.headers.get('location'),'/order');
 assert.match(response.headers.get('set-cookie'),/HttpOnly/i);
 assert.equal(response.headers.get('cache-control'),'no-store');
 return {Cookie:response.headers.get('set-cookie').split(';')[0],Origin:base};
}
const [guest, other, guestB, guestSibling] = await Promise.all([a.token,a.token,b.token,sibling.token].map(enter));
assert.notEqual(guest.Cookie,other.Cookie);
const sessionFor = async (headers) => (await call('/api/session',{headers})).json();
const visit = await sessionFor(guest);
assert.equal((await sessionFor(other)).visit_id,visit.visit_id);
assert.equal((await sessionFor(other)).expires_at,visit.expires_at);
assert.notEqual((await sessionFor(guestSibling)).visit_id,visit.visit_id);
const page = await call('/order',{headers:guest});
assert.match(page.headers.get('content-type'), /^text\/html/);
assert.ok((await page.text()).includes('<div id="root">'));
const menu=await (await call('/api/menu',{headers:guest})).json();
const body={items:[{menu_item_id:menu.find(i=>i.all_day && i.is_available && !i.temperature_options?.length).id,quantity:1}]};
await call('/api/orders',{method:'POST',headers:{...guest,Origin:'https://wrong.example'},body,expected:403});
await call('/api/orders',{method:'POST',headers:guest,body:{...body,table_number:b.table.number},expected:422});
const order=await (await call('/api/orders',{method:'POST',headers:guest,body,expected:201})).json();
assert.equal(order.table_number,a.table.number);
assert.equal((await floor()).find(table=>table.number===a.table.number).order_count,1);
await close(a.table.number,await tableBill(a.table.number),401,guest);
await call('/api/session/end',{method:'POST',headers:guest,expected:404});
assert.equal((await (await call('/api/orders/my',{headers:other})).json())[0].id,order.id);
assert.equal((await (await call('/api/orders/my',{headers:guestB})).json()).length,0);
assert.equal((await (await call('/api/orders/my',{headers:guestSibling})).json()).length,0);
const rotated = await (await call('/api/pc/qr-token',{headers:a.headers})).json();
assert.equal((await sessionFor(await enter(rotated))).visit_id,visit.visit_id);
await call('/api/session',{headers:guest});
const compose=['compose','-p','spacearenafrontendcheck','-f','docker-compose.yml','-f','docker-compose.preview.yml','exec','-T'];
execFileSync('docker',[...compose,'redis','redis-cli','EXPIRE','qr:'+createHash('sha256').update(a.token.temp_token).digest('hex'),'0']);
await call(new URL(a.token.order_url).pathname+new URL(a.token.order_url).search,{expected:403});
await call('/api/session',{headers:guest});
for(const status of ['accepted','preparing','ready','served']) await call(`/api/admin/orders/${order.id}/status`,{method:'PATCH',headers:admin,body:{status}});
assert.equal((await (await call('/api/orders/my',{headers:guest})).json()).length,1);
execFileSync('docker',[...compose,'db','psql','-U',env.POSTGRES_USER||'orders','-d',env.POSTGRES_DB||'orders','-c',`UPDATE orders SET served_at=NOW()-INTERVAL '16 minutes' WHERE id=${order.id}`]);
assert.equal((await (await call('/api/orders/my',{headers:guest})).json()).length,1);
assert.equal((await floor()).find(table=>table.number===a.table.number).order_count,1);
await call(`/api/admin/orders/${order.id}`,{headers:admin});
const cartFor = async (headers) => (await call('/api/cart',{headers})).json();
const cart = await cartFor(guest);
const draft = {...cart,items:body.items};
await call('/api/cart',{method:'PUT',headers:{...guest,Origin:'https://wrong.example'},body:draft,expected:403});
await call('/api/cart',{method:'PUT',headers:guestSibling,body:draft,expected:409});
const savedCart = await (await call('/api/cart',{method:'PUT',headers:guest,body:draft})).json();
assert.deepEqual(await cartFor(other),savedCart);
await call('/api/cart',{method:'PUT',headers:other,body:draft,expected:409});
assert.deepEqual((await cartFor(guestSibling)).items,[]);
const submitCart = (headers) => call('/api/orders',{
 method:'POST',headers,body:{visit_id:savedCart.visit_id,cart_revision:savedCart.revision},expected:[201,409],
});
const checkouts = await Promise.all([submitCart(guest),submitCart(other)]);
assert.deepEqual(checkouts.map(response=>response.status).sort(),[201,409]);
assert.deepEqual((await cartFor(other)).items,[]);
assert.equal((await (await call('/api/orders/my',{headers:other})).json()).length,2);
const createItem = async (body) =>
  (await call('/api/admin/menu', {method:'POST',headers:admin,body,expected:201})).json();
const configurable = await createItem({
  name:'Проверка настроек', price:'150.00', all_day:true,
  removable_ingredients:['Лук','Соус'], temperature_options:['cold','warm'],
});
const kitchen = await createItem({name:'Проверка расписания',price:'150.00',all_day:false});
try {
 const current = await (await call('/api/menu',{headers:guest})).json();
 const kitchenOnMenu = current.find(item=>item.id===kitchen.id);
 const kitchenStatus = kitchenOnMenu.unavailable_reason === 'kitchen_closed' ? 409 : 201;
 await call('/api/orders', {method:'POST',headers:guest,body:{items:[
  {menu_item_id:kitchen.id,quantity:1},
 ]},expected:kitchenStatus});

 const cold = {menu_item_id:configurable.id,quantity:1,removed_ingredients:['Лук'],temperature:'cold'};
 const warm = {menu_item_id:configurable.id,quantity:2,removed_ingredients:['Соус'],temperature:'warm'};
 const placeOrder = (items,expected) =>
  call('/api/orders',{method:'POST',headers:guest,body:{items},expected});
 await placeOrder([{...cold,removed_ingredients:['Соль']}],409);
 await placeOrder([{...warm,temperature:null}],409);
 await placeOrder([cold,cold],422);
 const result = await (await placeOrder([cold,warm],201)).json();
 assert.equal(result.items.length,2);
 await call(`/api/admin/menu/${configurable.id}`,{method:'PATCH',headers:admin,body:{
  removable_ingredients:[],temperature_options:['warm'],
 }});
 await placeOrder([cold],409);
 const saved = await (await call(`/api/admin/orders/${result.id}`,{headers:admin})).json();
 assert.deepEqual(saved.items.map(({menu_item_id,quantity,removed_ingredients,temperature})=>
  ({menu_item_id,quantity,removed_ingredients,temperature})),[cold,warm]);
} finally {
 for(const item of [configurable,kitchen]) {
  await call(`/api/admin/menu/${item.id}`,{method:'DELETE',headers:admin,expected:204});
 }
}
const legacyKey = randomBytes(32).toString('hex');
const legacySession = {
 table_id:sibling.table.id, table_number:sibling.table.number, pc_id:sibling.pc.id,
 table_version:1, pc_version:1, expires_at:new Date(Date.now()+180_000).toISOString(),
};
execFileSync('docker',[...compose,'redis','redis-cli','SET',
 'session:'+createHash('sha256').update(legacyKey).digest('hex'),JSON.stringify(legacySession),'EX','180']);
const legacyHeaders = {Cookie:`space_guest=${legacyKey}`,Origin:base};
const outdatedBill = await tableBill(a.table.number);
const separateOrder = await (await call('/api/orders',{method:'POST',headers:guestB,body,expected:201})).json();
const legacyOrder = await (await call('/api/orders',{method:'POST',headers:legacyHeaders,body,expected:201})).json();
assert.equal((await (await call('/api/orders/my',{headers:guestSibling})).json()).length,0);
await call(new URL(sibling.token.order_url).pathname+new URL(sibling.token.order_url).search,{
 headers:legacyHeaders,expected:303,
});
assert.equal((await (await call('/api/orders/my',{headers:guestSibling})).json())[0].id,legacyOrder.id);
await close(a.table.number,outdatedBill,409);
const cancelled = await (await call('/api/orders',{method:'POST',headers:other,body,expected:201})).json();
await call(`/api/admin/orders/${cancelled.id}/status`,{
 method:'PATCH',headers:admin,body:{status:'cancelled'},
});
const siblingCart = await cartFor(guestSibling);
await call('/api/cart',{method:'PUT',headers:guestSibling,body:{...siblingCart,items:body.items}});
const bill = await tableBill(a.table.number);
assert.ok(bill.orders.some(order=>order.id===legacyOrder.id));
assert.ok(!bill.orders.some(order=>order.id===cancelled.id));
const summary = (await floor()).find(table=>table.number===a.table.number);
assert.equal(summary.order_count,bill.orders.length);
assert.equal(Math.round(Number(summary.total)*100),bill.orders.flatMap(order=>order.items)
 .reduce((sum,item)=>sum+item.quantity*Math.round(Number(item.unit_price)*100),0));
await flag(a.table.number,{version:bill.version,flagged:true});
const closeAttempts = await Promise.all([
 close(a.table.number,bill,[204,409]),
 close(a.table.number,bill,[204,409]),
]);
assert.deepEqual(closeAttempts.map(response=>response.status).sort(),[204,409]);
assert.deepEqual((await tableBill(a.table.number)).orders,[]);
assert.equal((await tableBill(a.table.number)).flagged,false);
assert.equal((await tableBill(b.table.number)).orders[0].id,separateOrder.id);
const paid = await (await call(`/api/admin/orders/${order.id}`,{headers:admin})).json();
assert.ok(paid.paid_at);
assert.equal(paid.status,'served');
const paidLegacy = await (await call(`/api/admin/orders/${legacyOrder.id}`,{headers:admin})).json();
assert.ok(paidLegacy.paid_at);
assert.equal(paidLegacy.status,'new');
await call('/api/session',{headers:guest,expected:403});
await call('/api/session',{headers:other,expected:403});
await call('/api/session',{headers:legacyHeaders,expected:403});
await call('/api/session',{headers:guestSibling,expected:403});
await call('/api/session',{headers:guestB});
await call(new URL(rotated.order_url).pathname+new URL(rotated.order_url).search,{expected:403});
await call(new URL(sibling.token.order_url).pathname+new URL(sibling.token.order_url).search,{expected:403});
const [heartbeat,fresh] = await Promise.all([
 call('/api/pc/status',{headers:a.headers}).then(response=>response.json()),
 call('/api/pc/qr-token',{headers:a.headers}).then(response=>response.json()),
]);
assert.notEqual(heartbeat.access_version,rotated.access_version);
assert.equal(heartbeat.access_version,fresh.access_version);
const nextGuest = await enter(fresh);
assert.notEqual((await sessionFor(nextGuest)).visit_id,visit.visit_id);
assert.equal((await (await call('/api/orders/my',{headers:nextGuest})).json()).length,0);
assert.deepEqual((await cartFor(nextGuest)).items,[]);
const siblingFresh = await (await call('/api/pc/qr-token',{headers:sibling.headers})).json();
const nextSibling = await enter(siblingFresh);
assert.notEqual((await sessionFor(nextSibling)).visit_id,siblingCart.visit_id);
assert.deepEqual((await cartFor(nextSibling)).items,[]);
assert.deepEqual(await (await call('/api/orders/my',{headers:nextSibling})).json(),[]);
const emptyBill = await tableBill(a.table.number);
await close(a.table.number,emptyBill,409);
assert.equal((await sessionFor(nextGuest)).visit_id,(await cartFor(nextGuest)).visit_id);
await flag(a.table.number,{version:emptyBill.version,flagged:true});
const [racingOrder,racingClose] = await Promise.all([
 call('/api/orders',{method:'POST',headers:nextGuest,body,expected:[201,403]}),
 close(a.table.number,emptyBill,[204,409]),
]);
if (racingOrder.status === 201) {
 assert.equal(racingClose.status,409);
 await close(a.table.number,await tableBill(a.table.number));
} else {
 assert.equal(racingClose.status,204);
}
await call(`/api/admin/pcs/${a.pc.id}/active`,{method:'PATCH',headers:admin,body:{active:false}});
await call('/api/pc/qr-token',{headers:a.headers,expected:403});
await call('/api/session',{headers:guest,expected:403});
await call('/api/pc/status',{headers:a.headers,expected:403});
await call(`/api/admin/pcs/${b.pc.id}/rotate`,{method:'POST',headers:admin});
await call('/api/pc/qr-token',{headers:b.headers,expected:403});
const logs = execFileSync('docker',['compose','-p','spacearenafrontendcheck','-f','docker-compose.yml','-f','docker-compose.preview.yml','logs','api','web'],{encoding:'utf8'});
assert.ok(!logs.includes(a.headers.Authorization.slice(7)) && !logs.includes(a.token.temp_token));
console.log('PASS: rotating QR, shared visits, cart concurrency, floor map, manual flags, concurrent settlement, visit reset, opening hours, and order snapshots');
