const $ = (selector) => document.querySelector(selector);
const SUPABASE_URL = "https://ngpvqqcgizpzjmrxkeaw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_XLYJMhAlLgA6R74oawkL4A_qJkTVOHr";
const authClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const authScreen = $("#auth-screen");
const authForm = $("#auth-form");
const authSwitch = $("#auth-switch");
const authSubmit = $("#auth-submit");
const authMessage = $("#auth-message");
let isSignUp = false;
const productModal = $("#product-modal");
const movementModal = $("#movement-modal");
const productForm = $("#product-form");
const movementForm = $("#movement-form");
const productList = $("#product-list");
const searchInput = $("#search-input");
const categoryFilter = $("#category-filter");
const currencyFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const storageKeyPrefix = "stockly-products-v3-";
const movementKeyPrefix = "stockly-movements-v3-";
let storageKey = "";
let movementKey = "";

function setAuthMessage(message = "", isError = true) {
    authMessage.textContent = message;
    authMessage.style.color = isError ? "" : "#20b87a";
}

function updateUserInterface(session) {
    authScreen.classList.toggle("hidden", Boolean(session));
    if (!session) {
        storageKey = "";
        movementKey = "";
        products = [];
        movements = [];
        render();
        return;
    }
    const email = session.user.email || "Utilisateur";
    $("#user-email").textContent = email;
    $("#user-avatar").textContent = email.slice(0, 2).toUpperCase();
    loadUserData(session.user.id);
}

authSwitch.addEventListener("click", () => {
    isSignUp = !isSignUp;
    authSubmit.textContent = isSignUp ? "Créer mon compte" : "Se connecter";
    authSwitch.textContent = isSignUp ? "J'ai déjà un compte" : "Créer un compte";
    $("#auth-title").textContent = isSignUp ? "Créer votre compte" : "Bienvenue sur Stockly";
    $(".auth-intro").textContent = isSignUp ? "Inscrivez-vous pour commencer à gérer votre stock." : "Connectez-vous pour gérer votre inventaire.";
    setAuthMessage("");
});

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!authClient) {
        setAuthMessage("Le service d'authentification est indisponible.");
        return;
    }
    const data = Object.fromEntries(new FormData(authForm).entries());
    authSubmit.disabled = true;
    setAuthMessage("Connexion en cours...", false);
    const result = isSignUp
        ? await authClient.auth.signUp({ email: data.email, password: data.password })
        : await authClient.auth.signInWithPassword({ email: data.email, password: data.password });
    authSubmit.disabled = false;
    if (result.error) {
        setAuthMessage(result.error.message);
        return;
    }
    if (isSignUp && !result.data.session) {
        setAuthMessage("Compte créé. Vérifiez votre e-mail pour confirmer votre adresse.", false);
        return;
    }
    authForm.reset();
    setAuthMessage("");
});

$("#logout-button").addEventListener("click", async () => {
    if (!authClient) return;
    const { error } = await authClient.auth.signOut();
    if (error) showToast("Impossible de se déconnecter.", "error");
});

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));
const escapeCsvCell = (value) => {
    const text = String(value);
    const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
};

function readInitialProducts() {
    return [];
}

let products = [];
let movements = [];

function loadUserData(userId) {
    storageKey = `${storageKeyPrefix}${userId}`;
    movementKey = `${movementKeyPrefix}${userId}`;
    products = JSON.parse(localStorage.getItem(storageKey) || "null") || readInitialProducts();
    movements = JSON.parse(localStorage.getItem(movementKey) || "[]");
    render();
}

function save() {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(products));
    localStorage.setItem(movementKey, JSON.stringify(movements.slice(0, 20)));
}

function statusFor(stock, threshold = 10) {
    if (stock <= 0) return ["out-stock", "Rupture"];
    if (stock <= threshold) return ["low-stock", "Stock faible"];
    return ["in-stock", "En stock"];
}

function productRow(product) {
    const [statusClass, statusLabel] = statusFor(product.stock, product.threshold);
    const iconClass = product.category === "Électronique" ? "blue-image" : product.category === "Mobilier" ? "green-image" : "yellow-image";
    return `<tr data-id="${escapeHtml(product.id)}" data-category="${escapeHtml(product.category)}">
        <td><div class="product-info"><span class="product-image ${iconClass}">□</span><strong>${escapeHtml(product.name)}</strong></div></td>
        <td>${escapeHtml(product.sku)}</td><td>${escapeHtml(product.category)}</td>
        <td>${currencyFormatter.format(product.price)} FCFA</td><td><strong>${product.stock}</strong> unités</td>
        <td><span class="status ${statusClass}"><i></i> ${statusLabel}</span></td>
        <td><button class="row-menu movement-action" type="button" title="Modifier le stock">↕</button><button class="row-menu delete-action" type="button" title="Supprimer">×</button></td>
    </tr>`;
}

function render() {
    productList.innerHTML = products.map(productRow).join("");
    $("#total-products").textContent = currencyFormatter.format(products.length);
    $("#stock-value").textContent = `${currencyFormatter.format(products.reduce((sum, product) => sum + product.price * product.stock, 0))} FCFA`;
    $("#low-stock-count").textContent = products.filter((product) => product.stock <= product.threshold).length;
    $(".nav-item[href='#products'] b").textContent = products.length;
    applyFilters();
    renderMovementOptions();
}

function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    const category = categoryFilter.value;
    [...productList.rows].forEach((row) => {
        row.hidden = !row.textContent.toLowerCase().includes(query) || (category !== "all" && row.dataset.category !== category);
    });
    const visible = [...productList.rows].filter((row) => !row.hidden).length;
    document.querySelector(".table-footer span").innerHTML = `Affichage de <strong>${visible}</strong> sur <strong>${products.length}</strong> produits`;
}

function showToast(message, type = "success") {
    const toast = $("#toast");
    toast.textContent = message;
    toast.className = `toast visible ${type}`;
    window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

function setModal(modal, open) {
    modal.classList.toggle("open", open);
    modal.setAttribute("aria-hidden", String(!open));
}

function renderMovementOptions() {
    $("#movement-product").innerHTML = products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} — ${product.stock} unités</option>`).join("");
}

$("#open-modal").addEventListener("click", () => setModal(productModal, true));
$("#close-modal").addEventListener("click", () => setModal(productModal, false));
$("#cancel-modal").addEventListener("click", () => setModal(productModal, false));
$("#close-movement").addEventListener("click", () => setModal(movementModal, false));
$("#cancel-movement").addEventListener("click", () => setModal(movementModal, false));
[productModal, movementModal].forEach((modal) => modal.addEventListener("click", (event) => {
    if (event.target === modal) setModal(modal, false);
}));
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        setModal(productModal, false);
        setModal(movementModal, false);
    }
});

productForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(productForm).entries());
    const skuExists = products.some((product) => product.sku.toLowerCase() === data.sku.toLowerCase());
    if (skuExists) {
        showToast("Ce SKU existe déjà.", "error");
        return;
    }
    products.unshift({ id: `product-${Date.now()}`, name: data.name.trim(), sku: data.sku.trim(), category: data.category, price: Number(data.price), stock: Number(data.stock), threshold: 10 });
    movements.unshift({ label: "Nouveau produit ajouté", detail: data.name, amount: "—", date: new Date().toISOString() });
    save();
    render();
    productForm.reset();
    setModal(productModal, false);
    showToast("Produit ajouté avec succès.");
});

productList.addEventListener("click", (event) => {
    const row = event.target.closest("tr");
    if (!row) return;
    const product = products.find((item) => item.id === row.dataset.id);
    if (!product) return;
    if (event.target.closest(".delete-action")) {
        if (!window.confirm(`Supprimer « ${product.name} » ?`)) return;
        products = products.filter((item) => item.id !== product.id);
        save();
        render();
        showToast("Produit supprimé.");
    } else if (event.target.closest(".movement-action")) {
        $("#movement-product").value = product.id;
        setModal(movementModal, true);
    }
});

movementForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(movementForm).entries());
    const product = products.find((item) => item.id === data.product);
    const quantity = Number(data.quantity);
    if (!product || quantity < 1) return;
    if (data.type === "out" && quantity > product.stock) {
        showToast("Stock insuffisant pour cette sortie.", "error");
        return;
    }
    product.stock += data.type === "in" ? quantity : -quantity;
    movements.unshift({ label: data.type === "in" ? "Entrée de stock" : "Sortie de stock", detail: product.name, amount: `${data.type === "in" ? "+" : "−"} ${quantity}`, date: new Date().toISOString() });
    save();
    render();
    movementForm.reset();
    setModal(movementModal, false);
    showToast("Mouvement enregistré.");
});

$("#export-csv").addEventListener("click", () => {
    const headers = ["Produit", "SKU", "Catégorie", "Prix (FCFA)", "Stock", "Seuil"];
    const rows = products.map((product) => [product.name, product.sku, product.category, product.price, product.stock, product.threshold]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    link.download = `stockly-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Export CSV téléchargé.");
});

searchInput.addEventListener("input", applyFilters);
categoryFilter.addEventListener("change", applyFilters);
$("#theme-toggle").addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("stockly-theme", document.body.classList.contains("dark-mode") ? "dark" : "light");
});
if (localStorage.getItem("stockly-theme") === "dark") document.body.classList.add("dark-mode");

document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((nav) => nav.classList.remove("active"));
    item.classList.add("active");
}));

if (authClient) {
    authClient.auth.onAuthStateChange((_event, session) => updateUserInterface(session));
    authClient.auth.getSession().then(({ data, error }) => {
        if (error) {
            setAuthMessage("Impossible de vérifier la session.");
            return;
        }
        updateUserInterface(data.session);
    });
} else {
    setAuthMessage("Le service d'authentification est indisponible.");
}

render();
