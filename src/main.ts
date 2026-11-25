import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource-variable/source-serif-4/opsz-italic.css";
import "./style.css";
import { sb, configured } from "./supabase";
import { initStore, loadPlan, pullDocs, type Plan } from "./store";
import { renderWorkspace } from "./workspace";
import { notesPage, sermonsPage, planPage, settingsPage } from "./pages";
import { dashboard, loginPage } from "./home";
import { h } from "./ui";
import { startActivity } from "./activity";

const root = document.getElementById("app")!;
document.documentElement.dataset.theme = localStorage.getItem("qt-theme") ??
  (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

let plan: Plan | null = null;
let started = false;

async function route() {
  const [path, query] = location.hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query ?? "");
  const parts = (path || "/").split("/").filter(Boolean);
  window.scrollTo(0, 0);
  try {
    if (parts[0] === "day" && plan) await renderWorkspace(root, plan, Number(parts[1]), params.get("v") ? Number(params.get("v")) : undefined);
    else if (parts[0] === "notes") await notesPage(root, params);
    else if (parts[0] === "sermons") await sermonsPage(root);
    else if (parts[0] === "plan") planPage(root, plan);
    else if (parts[0] === "settings") settingsPage(root);
    else await dashboard(root, plan);
  } catch (e: any) {
    root.replaceChildren(h("main", { class: "page" }, h("h1", {}, "Something went wrong"), h("pre", {}, String(e?.message ?? e)), h("a", { href: "#/" }, "Home")));
  }
}

async function start() {
  if (started) return;
  started = true;
  await initStore();
  startActivity();
  plan = await loadPlan();
  pullDocs("notes").catch(() => {});
  pullDocs("sermons").catch(() => {});
  window.addEventListener("hashchange", route);
  route();
}

async function boot() {
  if (!configured) {
    root.replaceChildren(h("main", { class: "login" }, h("h1", {}, "Quiet Time"), h("p", {}, "Supabase is not configured. Copy .env.example to .env.local and fill in the project URL and publishable key.")));
    return;
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") { started = false; }
    else if (session && !started && event === "SIGNED_IN") start();
  });
  const { data } = await sb.auth.getSession();
  // Offline with a stored session still works: the app runs from IndexedDB.
  if (data.session) start();
  else loginPage(root, () => start());
}

boot();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
