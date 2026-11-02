/* Banco Ceiba - lógica del cliente. Base de datos: IndexedDB (usuarios, cuentas, movimientos). */
let db, sesion = null;
const $ = (s, r = document) => r.querySelector(s);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const Q = n => "Q " + Number(n).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = iso => new Date(iso).toLocaleString("es-GT", { dateStyle: "short", timeStyle: "short" });
const redondear = n => Math.round(n * 100) / 100;

/* ---------- Base de datos ---------- */
function abrirBD() {
  return new Promise((ok, err) => {
    const r = indexedDB.open("bancoCeiba", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("usuarios", { keyPath: "usuario" });
      d.createObjectStore("cuentas", { keyPath: "numero" }).createIndex("usuario", "usuario");
      d.createObjectStore("movimientos", { keyPath: "id", autoIncrement: true }).createIndex("cuenta", "cuenta");
    };
    r.onsuccess = () => { db = r.result; ok(); };
    r.onerror = () => err(r.error);
  });
}
const req = r => new Promise((ok, err) => { r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); });
const fin = t => new Promise((ok, err) => { t.oncomplete = ok; t.onerror = t.onabort = () => err(t.error); });
const store = (s, modo = "readonly") => db.transaction(s, modo).objectStore(s);
const todos = (s, idx, clave) => req(idx ? store(s).index(idx).getAll(clave) : store(s).getAll());

async function hash(t) {
  try {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  } catch { return t; }
}
function numeroCuenta() { return String(Math.floor(1e9 + Math.random() * 9e9)); }

async function crearCuenta(usuario, tipo, deposito) {
  const t = db.transaction(["cuentas", "movimientos"], "readwrite");
  let numero;
  do { numero = numeroCuenta(); } while (await req(t.objectStore("cuentas").get(numero)));
  t.objectStore("cuentas").add({ numero, usuario, tipo, saldo: deposito });
  t.objectStore("movimientos").add({ cuenta: numero, fecha: new Date().toISOString(), tipo: "Crédito", descripcion: "Depósito inicial", monto: deposito, saldo: deposito });
  await fin(t);
  return numero;
}

/* Transacción atómica: valida saldo, actualiza saldos y registra movimientos. */
async function mover({ origen, destino, monto, desc, descDestino, tipo }) {
  const t = db.transaction(["cuentas", "movimientos"], "readwrite");
  const C = t.objectStore("cuentas"), M = t.objectStore("movimientos");
  const o = await req(C.get(origen));
  if (!o) throw new Error("La cuenta de origen no existe.");
  if (monto > o.saldo) throw new Error(`Saldo insuficiente. Disponible: ${Q(o.saldo)}.`);
  let d = null;
  if (destino) {
    if (destino === origen) throw new Error("La cuenta de destino debe ser distinta a la de origen.");
    d = await req(C.get(destino));
    if (!d) throw new Error("La cuenta de destino no existe. Revise el número.");
  }
  const ahora = new Date().toISOString();
  o.saldo = redondear(o.saldo - monto);
  C.put(o);
  M.add({ cuenta: origen, fecha: ahora, tipo: tipo || "Débito", descripcion: desc, monto: -monto, saldo: o.saldo });
  if (d) {
    d.saldo = redondear(d.saldo + monto);
    C.put(d);
    M.add({ cuenta: destino, fecha: ahora, tipo: "Crédito", descripcion: descDestino, monto, saldo: d.saldo });
  }
  await fin(t);
  return d;
}

async function sembrar() {
  if ((await req(store("usuarios").count())) > 0) return;
  const t = db.transaction("usuarios", "readwrite");
  t.objectStore("usuarios").add({ usuario: "admin", clave: await hash("2026"), nombre: "Administrador del Sistema", dpi: "1000000000001", correo: "admin@bancoceiba.test", telefono: "50000001", direccion: "Ciudad de Guatemala", admin: true });
  t.objectStore("usuarios").add({ usuario: "ana", clave: await hash("1234"), nombre: "Ana López (cliente de prueba)", dpi: "1000000000002", correo: "ana@bancoceiba.test", telefono: "50000002", direccion: "Quetzaltenango" });
  await fin(t);
  await crearCuenta("admin", "Monetaria", 5000);
  await crearCuenta("admin", "Ahorro", 2000);
  await crearCuenta("ana", "Monetaria", 1000);
}

/* ---------- Registro y acceso ---------- */
async function registrar(e) {
  e.preventDefault();
  const f = e.target, err = $("#errRegistro");
  err.textContent = "";
  if (!f.checkValidity()) { err.textContent = "Revise los campos: " + [...f.elements].filter(x => x.name && !x.validity.valid).map(x => x.labels[0].firstChild.textContent.trim()).join(", ") + "."; return; }
  const d = Object.fromEntries(new FormData(f));
  d.usuario = d.usuario.trim().toLowerCase();
  if (await req(store("usuarios").get(d.usuario))) { err.textContent = "Ese usuario ya existe. Elija otro."; return; }
  const dep = redondear(parseFloat(d.deposito));
  const t = db.transaction("usuarios", "readwrite");
  t.objectStore("usuarios").add({ usuario: d.usuario, clave: await hash(d.clave), nombre: d.nombre.trim(), dpi: d.dpi, correo: d.correo, telefono: d.telefono, direccion: d.direccion.trim() });
  await fin(t);
  const num = await crearCuenta(d.usuario, d.tipo, dep);
  const r = $("#resumenRegistro");
  r.hidden = false;
  r.innerHTML = `<h3>Registro completado</h3><dl>
    <dt>Nombre</dt><dd>${esc(d.nombre)}</dd><dt>DPI</dt><dd>${esc(d.dpi)}</dd>
    <dt>Correo</dt><dd>${esc(d.correo)}</dd><dt>Teléfono</dt><dd>${esc(d.telefono)}</dd>
    <dt>Dirección</dt><dd>${esc(d.direccion)}</dd><dt>Usuario</dt><dd>${esc(d.usuario)}</dd>
    <dt>Cuenta ${esc(d.tipo)}</dt><dd>${num}</dd><dt>Saldo inicial</dt><dd>${Q(dep)}</dd></dl>
    <button class="boton" id="irAcceso">Ingresar al sistema</button>`;
  $("#irAcceso").onclick = () => { $("#formLogin").usuario.value = d.usuario; location.hash = "#acceso"; $("#formLogin").clave.focus(); };
  f.reset();
}

async function ingresar(e) {
  e.preventDefault();
  const f = e.target, err = $("#errLogin");
  const u = await req(store("usuarios").get(f.usuario.value.trim().toLowerCase()));
  if (!u || u.clave !== await hash(f.clave.value)) { err.textContent = "Usuario o contraseña incorrectos."; return; }
  err.textContent = ""; f.reset();
  sesion = u;
  $("#publico").hidden = true; $("#navPublica").hidden = true;
  $("#app").hidden = false; $("#navPrivada").hidden = false;
  $("#saludo").textContent = "Hola, " + u.nombre.split(" ")[0];
  $("#tabClientes").hidden = !u.admin;
  mostrar("cuentas");
}
function salir() {
  sesion = null;
  $("#app").hidden = true; $("#navPrivada").hidden = true;
  $("#publico").hidden = false; $("#navPublica").hidden = false;
  location.hash = "#"; scrollTo(0, 0);
}

/* ---------- Vistas ---------- */
const misCuentas = () => todos("cuentas", "usuario", sesion.usuario);
const opciones = c => c.map(x => `<option value="${x.numero}">${x.tipo} ${x.numero} · ${Q(x.saldo)}</option>`).join("");
const msg = (el, texto, bueno) => { el.className = bueno ? "ok" : "error"; el.textContent = texto; };

async function mostrar(v) {
  document.querySelectorAll("#pestanas button").forEach(b => b.classList.toggle("activa", b.dataset.vista === v));
  const cont = $("#vista");
  cont.innerHTML = "";
  await vistas[v](cont);
}

const vistas = {
  async cuentas(c) {
    const cs = await misCuentas();
    c.innerHTML = `<h2>Mis cuentas</h2>
      <div class="resumen" style="margin-bottom:1.2rem"><dl><dt>Cliente</dt><dd>${esc(sesion.nombre)}</dd><dt>DPI</dt><dd>${esc(sesion.dpi)}</dd>
      <dt>Correo</dt><dd>${esc(sesion.correo)}</dd><dt>Teléfono</dt><dd>${esc(sesion.telefono)}</dd><dt>Dirección</dt><dd>${esc(sesion.direccion)}</dd></dl></div>
      <div class="cuentas">${cs.map(x => `<article class="tarjeta"><h3>Cuenta ${esc(x.tipo)}</h3><div>${x.numero}</div><div class="saldo">${Q(x.saldo)}</div><span class="nota">Saldo disponible</span></article>`).join("")}</div>`;
  },

  async movimientos(c) {
    const cs = await misCuentas();
    c.innerHTML = `<h2>Últimos movimientos</h2><div class="fila"><label>Cuenta<select id="selCta">${opciones(cs)}</select></label></div><div id="tabla"></div>`;
    const pintar = async () => {
      const m = (await todos("movimientos", "cuenta", $("#selCta").value)).sort((a, b) => b.id - a.id).slice(0, 10);
      $("#tabla").innerHTML = tablaMov(m, true) || "<p>Esta cuenta aún no tiene movimientos.</p>";
    };
    $("#selCta").onchange = pintar; pintar();
  },

  async transferir(c) {
    const cs = await misCuentas();
    c.innerHTML = `<h2>Transferir entre cuentas</h2><form class="formulario" id="fTr" novalidate>
      <label>Cuenta de origen<select name="origen">${opciones(cs)}</select></label>
      <label>Cuenta de destino (10 dígitos)<input name="destino" required pattern="\\d{10}" inputmode="numeric"></label>
      <label>Monto (Q)<input name="monto" type="number" min="0.01" step="0.01" required></label>
      <label>Concepto<input name="concepto" maxlength="60" placeholder="Opcional"></label>
      <button class="boton">Transferir</button><p id="rTr" role="alert"></p></form>`;
    $("#fTr").onsubmit = async e => {
      e.preventDefault();
      const f = e.target, r = $("#rTr"), monto = redondear(parseFloat(f.monto.value));
      if (!f.checkValidity() || !(monto > 0)) return msg(r, "Escriba una cuenta de 10 dígitos y un monto mayor que cero.");
      try {
        const concepto = f.concepto.value.trim();
        await mover({ origen: f.origen.value, destino: f.destino.value, monto, desc: `Transferencia a ${f.destino.value}${concepto ? " · " + concepto : ""}`, descDestino: `Transferencia de ${f.origen.value}${concepto ? " · " + concepto : ""}`, tipo: "Transferencia" });
        msg(r, `Transferencia de ${Q(monto)} realizada.`, true);
        vistas.transferir(c).then(() => msg($("#rTr"), `Transferencia de ${Q(monto)} realizada.`, true));
      } catch (x) { msg(r, x.message); }
    };
  },

  async servicios(c) {
    const cs = await misCuentas();
    c.innerHTML = `<h2>Pagar servicios</h2><form class="formulario" id="fSv" novalidate>
      <label>Servicio<select name="servicio"><option>Telefonía</option><option>Agua potable</option><option>Electricidad</option><option>Internet</option></select></label>
      <label>Número de contrato o referencia<input name="ref" required minlength="4"></label>
      <label>Monto (Q)<input name="monto" type="number" min="0.01" step="0.01" required></label>
      <label>Pagar desde<select name="origen">${opciones(cs)}</select></label>
      <button class="boton">Pagar</button><p id="rSv" role="alert"></p></form>`;
    $("#fSv").onsubmit = async e => {
      e.preventDefault();
      const f = e.target, r = $("#rSv"), monto = redondear(parseFloat(f.monto.value));
      if (!f.checkValidity() || !(monto > 0)) return msg(r, "Indique la referencia (mínimo 4 caracteres) y un monto mayor que cero.");
      try {
        await mover({ origen: f.origen.value, monto, desc: `Pago de ${f.servicio.value} · ref. ${f.ref.value.trim()}`, tipo: "Pago de servicio" });
        vistas.servicios(c).then(() => msg($("#rSv"), `Pago de ${Q(monto)} realizado.`, true));
      } catch (x) { msg(r, x.message); }
    };
  },

  async estado(c) {
    const cs = await misCuentas();
    const hoy = new Date().toISOString().slice(0, 7);
    c.innerHTML = `<h2>Estado de cuenta</h2><div class="fila">
      <label>Cuenta<select id="eCta">${opciones(cs)}</select></label>
      <label>Mes<input type="month" id="eMes" value="${hoy}"></label>
      <button class="boton" id="eGen">Generar</button>
      <button class="boton" id="ePrint" hidden>Imprimir o guardar PDF</button></div><div id="eSalida"></div>`;
    $("#eGen").onclick = async () => {
      const num = $("#eCta").value, mes = $("#eMes").value;
      if (!mes) return;
      const cta = cs.find(x => x.numero === num);
      const [a, m] = mes.split("-").map(Number);
      const ini = new Date(a, m - 1, 1), fn = new Date(a, m, 1);
      const movs = (await todos("movimientos", "cuenta", num)).sort((x, y) => x.id - y.id);
      const antes = movs.filter(x => new Date(x.fecha) < ini), del = movs.filter(x => new Date(x.fecha) >= ini && new Date(x.fecha) < fn);
      const saldoIni = antes.length ? antes[antes.length - 1].saldo : 0;
      const cred = del.filter(x => x.monto > 0).reduce((s, x) => s + x.monto, 0), deb = del.filter(x => x.monto < 0).reduce((s, x) => s + x.monto, 0);
      $("#eSalida").innerHTML = `<div class="estado"><header><h3>Banco Ceiba · Estado de cuenta</h3></header>
        <p><b>${esc(sesion.nombre)}</b><br>Cuenta ${esc(cta.tipo)} ${num}<br>Periodo: ${ini.toLocaleDateString("es-GT", { month: "long", year: "numeric" })} · Emitido: ${fecha(new Date().toISOString())}</p>
        <div class="totales"><span>Saldo inicial<br><b>${Q(saldoIni)}</b></span><span>Créditos<br><b class="pos">${Q(cred)}</b></span><span>Débitos<br><b class="neg">${Q(Math.abs(deb))}</b></span><span>Saldo final<br><b>${Q(redondear(saldoIni + cred + deb))}</b></span></div>
        ${tablaMov(del, false) || "<p>No hubo movimientos en este periodo.</p>"}</div>`;
      $("#ePrint").hidden = false;
    };
    $("#ePrint").onclick = () => print();
  },

  async clientes(c) {
    const us = await todos("usuarios"), cs = await todos("cuentas");
    c.innerHTML = `<h2>Clientes registrados</h2><div class="tabla-wrap"><table><thead><tr><th>Usuario</th><th>Nombre</th><th>Correo</th><th>Cuentas</th><th class="num">Saldo total</th></tr></thead><tbody>${us.map(u => {
      const mias = cs.filter(x => x.usuario === u.usuario);
      return `<tr><td>${esc(u.usuario)}</td><td>${esc(u.nombre)}</td><td>${esc(u.correo)}</td><td>${mias.map(x => x.numero).join(", ")}</td><td class="num">${Q(mias.reduce((s, x) => s + x.saldo, 0))}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  }
};

function tablaMov(m, conTipo) {
  if (!m.length) return "";
  return `<div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Descripción</th><th class="num">Monto</th><th class="num">Saldo</th></tr></thead><tbody>${m.map(x =>
    `<tr><td>${fecha(x.fecha)}</td><td>${esc(x.descripcion)}</td><td class="num ${x.monto < 0 ? "neg" : "pos"}">${x.monto < 0 ? "-" : "+"}${Q(Math.abs(x.monto))}</td><td class="num">${Q(x.saldo)}</td></tr>`).join("")}</tbody></table></div>`;
}

/* ---------- Inicio ---------- */
(async function () {
  await abrirBD();
  await sembrar();
  $("#formRegistro").addEventListener("submit", registrar);
  $("#formLogin").addEventListener("submit", ingresar);
  $("#btnSalir").onclick = salir;
  $("#pestanas").onclick = e => { if (e.target.dataset.vista) mostrar(e.target.dataset.vista); };
})();
