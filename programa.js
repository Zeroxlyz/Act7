/* ==========================================================
 *  Restaurante Delicioso - programa.js
 *  Los pedidos se guardan en IndexedDB usando Dexie.
 * ========================================================== */

// ---------- Base de datos (IndexedDB) ----------
const db = new Dexie("RestauranteDB");

// Versión 1: la del ejemplo de clase
db.version(1).stores({
    pedidos: "++id, plato, bebida, extras, total, fecha"
});

// Versión 2: se agregan nombre y servicio como índices
// (los pedidos viejos se conservan)
db.version(2).stores({
    pedidos: "++id, nombre, plato, servicio, total, fecha"
});

// ---------- Precios y nombres ----------
const PRECIOS = {
    pizza: 12.00,
    hamburguesa: 7.50,
    tacos: 6.00,
    ensalada: 5.50,
    pasta: 9.00,
    pollo: 8.00,
    pequena: 1.00,
    mediana: 1.50,
    grande: 2.00,
    papas: 2.50,
    queso: 1.50,
    tocino: 2.00,
    helado: 1.80
};

const NOMBRES = {
    pizza: "Pizza Familiar",
    hamburguesa: "Hamburguesa",
    tacos: "Orden de Tacos",
    ensalada: "Ensalada César",
    pasta: "Pasta Alfredo",
    pollo: "Pollo Frito",
    pequena: "Pequeña",
    mediana: "Mediana",
    grande: "Grande",
    papas: "Papas Fritas",
    queso: "Extra Queso",
    tocino: "Tocino",
    helado: "Helado de Vainilla"
};

const PLATOS_VALIDOS = ["pizza", "hamburguesa", "tacos", "ensalada", "pasta", "pollo"];

const SERVICIOS = {
    mesa: "En mesa",
    llevar: "Para llevar",
    domicilio: "A domicilio"
};

const COSTO_DOMICILIO = 2.00;

// ---------- Elementos de la página ----------
const formulario = document.getElementById("formularioRestaurante");
const areaRecibo = document.getElementById("reciboRespuesta");
const divHistorial = document.getElementById("tablaHistorial");
const btnVerHistorial = document.getElementById("btnVerHistorial");
const btnBorrarHistorial = document.getElementById("btnBorrarHistorial");

// ---------- Funciones auxiliares ----------
function dinero(valor) {
    return "$" + valor.toFixed(2);
}

// Evita que el texto escrito por el usuario se interprete como HTML
function escaparHTML(texto) {
    return String(texto).replace(/[&<>"']/g, function (caracter) {
        const equivalencias = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };
        return equivalencias[caracter];
    });
}

function mostrarError(mensaje) {
    areaRecibo.innerHTML =
            '<p class="mensaje-error">' + escaparHTML(mensaje) + "</p>";
    areaRecibo.style.display = "block";
}

// ---------- Guardar un pedido ----------
formulario.addEventListener("submit", async function (event) {

    event.preventDefault();

    const nombre = document.getElementById("nombreCliente").value.trim();

    if (!nombre) {
        mostrarError("Ingresa el nombre del cliente.");
        return;
    }

    const platoElegido = document.querySelector('input[name="plato"]:checked');

    if (!platoElegido || !PLATOS_VALIDOS.includes(platoElegido.value)) {
        mostrarError("Selecciona un plato válido.");
        return;
    }

    const plato = platoElegido.value;

    const cantidad = parseInt(document.getElementById("cantidad").value, 10);

    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 20) {
        mostrarError("La cantidad debe ser un número entre 1 y 20.");
        return;
    }

    const bebida = document.querySelector('input[name="tamanoBebida"]:checked').value;

    const listaExtras = [];

    if (document.getElementById("extraPapas").checked) {
        listaExtras.push("papas");
    }
    if (document.getElementById("extraQueso").checked) {
        listaExtras.push("queso");
    }
    if (document.getElementById("extraTocino").checked) {
        listaExtras.push("tocino");
    }
    if (document.getElementById("extraHelado").checked) {
        listaExtras.push("helado");
    }

    const servicio = document.getElementById("servicio").value;
    const porcentajePropina = parseInt(document.getElementById("propina").value, 10);
    const notas = document.getElementById("notas").value.trim();

    // ----- Cálculos -----
    // Precio de una porción completa: plato + bebida + extras
    let precioUnitario = PRECIOS[plato] + PRECIOS[bebida];

    listaExtras.forEach(function (extra) {
        precioUnitario += PRECIOS[extra];
    });

    const subtotal = precioUnitario * cantidad;
    const envio = servicio === "domicilio" ? COSTO_DOMICILIO : 0;
    const propina = subtotal * (porcentajePropina / 100);
    const total = subtotal + envio + propina;

    const pedido = {
        nombre: nombre,
        plato: plato,
        cantidad: cantidad,
        bebida: bebida,
        extras: listaExtras.join(", ") || "Ninguno",
        servicio: servicio,
        propina: propina,
        notas: notas,
        total: total,
        fecha: new Date().toLocaleString("es-GT")
    };

    // ----- Guardar en IndexedDB -----
    try {
        const id = await db.pedidos.add(pedido);

        let recibo = `
            <h3>Recibo del Pedido #${id}</h3>
            <p><strong>Cliente:</strong> ${escaparHTML(nombre)}</p>
            <p><strong>Servicio:</strong> ${SERVICIOS[servicio]}</p>
            <hr>
            <p>${cantidad} x ${NOMBRES[plato]}: ${dinero(PRECIOS[plato] * cantidad)}</p>
            <p>${cantidad} x Bebida ${NOMBRES[bebida]}: ${dinero(PRECIOS[bebida] * cantidad)}</p>
        `;

        listaExtras.forEach(function (extra) {
            recibo += `<p>${cantidad} x ${NOMBRES[extra]}: ${dinero(PRECIOS[extra] * cantidad)}</p>`;
        });

        if (notas) {
            recibo += `<p><strong>Notas:</strong> ${escaparHTML(notas)}</p>`;
        }

        recibo += `<hr><p>Subtotal: ${dinero(subtotal)}</p>`;

        if (envio > 0) {
            recibo += `<p>Envío a domicilio: ${dinero(envio)}</p>`;
        }

        if (porcentajePropina > 0) {
            recibo += `<p>Propina (${porcentajePropina}%): ${dinero(propina)}</p>`;
        }

        recibo += `
            <p class="total">TOTAL: ${dinero(total)}</p>
            <p>Pedido guardado correctamente</p>
        `;

        areaRecibo.innerHTML = recibo;
        areaRecibo.style.display = "block";

        formulario.reset();

        // Si los datos están visibles, se refrescan
        if (divHistorial.style.display === "block") {
            await actualizarHistorialPantalla();
        }

    } catch (error) {
        console.error(error);
        mostrarError("No se pudo guardar el pedido. Revisa la base de datos del navegador.");
    }
});

// ---------- Mostrar datos ----------
async function actualizarHistorialPantalla() {

    try {
        const todos = await db.pedidos.orderBy("id").reverse().toArray();

        if (todos.length === 0) {
            divHistorial.innerHTML = '<p class="vacio">No hay pedidos registrados.</p>';
            return;
        }

        // Resumen (MODIFICACIÓN 3): pedidos, ventas totales y promedio
        let ventasTotales = 0;

        todos.forEach(function (pedido) {
            ventasTotales += pedido.total;
        });

        const promedio = ventasTotales / todos.length;

        divHistorial.innerHTML = `
            <div class="resumen">
                <div class="resumen-dato">
                    <strong>${todos.length}</strong>
                    <span>Pedidos</span>
                </div>
                <div class="resumen-dato">
                    <strong>${dinero(ventasTotales)}</strong>
                    <span>Ventas totales</span>
                </div>
                <div class="resumen-dato">
                    <strong>${dinero(promedio)}</strong>
                    <span>Promedio</span>
                </div>
            </div>

            <input
                type="text"
                id="buscador"
                placeholder="Buscar por nombre del cliente..."
                >

            <div class="lista-pedidos" id="listaPedidos"></div>
        `;

        const buscador = document.getElementById("buscador");

        buscador.addEventListener("input", function () {
            dibujarLista(todos, buscador.value);
        });

        dibujarLista(todos, "");

    } catch (error) {
        console.error(error);
        divHistorial.textContent = "Error al cargar el historial.";
    }
}

// Dibuja la lista de pedidos, aplicando el filtro del buscador
function dibujarLista(pedidos, filtro) {

    const lista = document.getElementById("listaPedidos");
    const texto = filtro.trim().toLowerCase();

    const visibles = pedidos.filter(function (pedido) {
        return (pedido.nombre || "").toLowerCase().includes(texto);
    });

    if (visibles.length === 0) {
        lista.innerHTML = '<p class="vacio">Ningún pedido coincide con la búsqueda.</p>';
        return;
    }

    let html = "";

    visibles.forEach(function (pedido) {

        const extras = pedido.extras === "Ninguno"
                ? "Ninguno"
                : pedido.extras.split(", ")
                .map(function (extra) {
                    return NOMBRES[extra] || extra;
                })
                .join(", ");

        // Los pedidos de la versión 1 no tienen cantidad ni servicio
        const cantidad = pedido.cantidad || 1;
        const servicio = SERVICIOS[pedido.servicio] || "No registrado";

        html += `
            <div class="item-pedido">
                <div class="item-cabecera">
                    <strong>Pedido #${pedido.id}</strong>
                    <button
                        type="button"
                        class="btn-eliminar"
                        data-id="${pedido.id}"
                        >
                        Eliminar
                    </button>
                </div>
                <p>${escaparHTML(pedido.fecha)}</p>
                <p>Cliente: ${escaparHTML(pedido.nombre || "Sin nombre")}</p>
                <p>Plato: ${cantidad} x ${NOMBRES[pedido.plato] || "No disponible"}</p>
                <p>Bebida: ${NOMBRES[pedido.bebida] || "No disponible"}</p>
                <p>Extras: ${escaparHTML(extras)}</p>
                <p>Servicio: ${servicio}</p>
                <p>Total: <strong>${dinero(pedido.total)}</strong></p>
            </div>
        `;
    });

    lista.innerHTML = html;
}

// Botón "Eliminar" de cada pedido (un solo listener para toda la lista)
divHistorial.addEventListener("click", async function (event) {

    const boton = event.target.closest(".btn-eliminar");

    if (!boton) {
        return;
    }

    const id = Number(boton.dataset.id);

    if (!confirm("¿Eliminar el pedido #" + id + "?")) {
        return;
    }

    try {
        await db.pedidos.delete(id);
        await actualizarHistorialPantalla();
    } catch (error) {
        console.error(error);
        alert("Error al eliminar el pedido.");
    }
});

// Botón "Mostrar Datos" / "Ocultar Datos"
btnVerHistorial.addEventListener("click", async function () {

    if (divHistorial.style.display === "block") {

        divHistorial.style.display = "none";
        btnVerHistorial.textContent = "Mostrar Datos";

    } else {

        await actualizarHistorialPantalla();

        divHistorial.style.display = "block";
        btnVerHistorial.textContent = "Ocultar Datos";
    }
});

// ---------- Limpiar datos ----------
btnBorrarHistorial.addEventListener("click", async function () {

    const confirmar = confirm(
            "¿Estás seguro de eliminar TODOS los pedidos? " +
            "Esta acción no se puede deshacer."
            );

    if (!confirmar) {
        return;
    }

    try {
        await db.pedidos.clear();

        alert("Datos eliminados correctamente.");

        if (divHistorial.style.display === "block") {
            await actualizarHistorialPantalla();
        }

    } catch (error) {
        console.error(error);
        alert("Error al eliminar los datos.");
    }
});
