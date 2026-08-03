import { collection, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";

const STORAGE_KEY = "apex-hq-notifications-v1";
const MAX_ITEMS = 80;
const ownerUids = (import.meta.env.VITE_APEX_OWNER_UIDS || "fnc4G85CtmQVy0OooOzfOoSC9u22,FqDrn1aPFHXUB5ogb2rN9D7mRG42")
  .split(",")
  .map(value => value.trim());

let items = loadItems();
let open = false;
let mounted = false;
let baselineReady = false;
let unsubscribe = [];

function loadItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

function timestamp(value) {
  if (value?.toDate) return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return Date.now();
}

function latestTime(data) {
  return timestamp(data.updatedAt || data.createdAt || data.submittedAt || data.requestedAt);
}

function labelFor(type, data, changeType) {
  const name = data.customerName || data.name || data.email || "Customer";
  if (type === "booking") {
    if (changeType === "added") return { title: "New booking request", body: `${name} requested ${data.serviceName || "a detail"}${data.bookingDate ? ` for ${data.bookingDate}` : ""}.`, icon: "📅", tab: "inbox" };
    return { title: "Booking request updated", body: `${name}'s booking request was modified.`, icon: "✏️", tab: "inbox" };
  }
  if (type === "inquiry") {
    if (changeType === "added") return { title: "New customer inquiry", body: `${name} sent a new inquiry.`, icon: "💬", tab: "inbox" };
    return { title: "Inquiry updated", body: `${name}'s inquiry was modified.`, icon: "✏️", tab: "inbox" };
  }
  const status = data.status || "updated";
  if (changeType === "added") return { title: "New job added", body: `${name} — ${data.packageName || data.serviceName || "Apex job"}.`, icon: "◆", tab: "jobs" };
  return { title: "Job updated", body: `${name}'s job is now ${status}.`, icon: "🔔", tab: "jobs" };
}

function addNotification(type, document, changeType) {
  const data = document.data();
  const eventTime = latestTime(data);
  const key = `${type}:${document.id}:${changeType}:${eventTime}:${data.status || ""}`;
  if (items.some(item => item.key === key)) return;
  const copy = labelFor(type, data, changeType);
  const item = { key, id: document.id, type, ...copy, createdAt: Date.now(), read: false };
  items = [item, ...items].slice(0, MAX_ITEMS);
  saveItems();
  render();
  showSystemNotification(item);
}

function watch(type, name) {
  let first = true;
  return onSnapshot(collection(db, name), snapshot => {
    if (first) {
      first = false;
      return;
    }
    snapshot.docChanges().forEach(change => {
      if (change.type === "removed") return;
      addNotification(type, change.doc, change.type);
    });
  });
}

function unreadCount() {
  return items.filter(item => !item.read).length;
}

function markAllRead() {
  items = items.map(item => ({ ...item, read: true }));
  saveItems();
  render();
}

function clearAll() {
  items = [];
  saveItems();
  render();
}

async function requestPermission() {
  if (!("Notification" in window)) return;
  const result = await Notification.requestPermission();
  render();
  if (result === "granted") {
    new Notification("Apex HQ notifications enabled", {
      body: "Booking requests and changes can now alert you while Apex HQ is open or running in the background.",
      icon: "/apex-logo-official.svg"
    });
  }
}

function showSystemNotification(item) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const notification = new Notification(`Apex HQ — ${item.title}`, {
      body: item.body,
      icon: "/apex-logo-official.svg",
      badge: "/apex-logo-official.svg",
      tag: item.key
    });
    notification.onclick = () => {
      window.focus();
      open = true;
      render();
    };
  } catch {
    // Safari may reject notifications in some foreground states.
  }
}

function formatWhen(ms) {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(ms).toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

function mount() {
  if (mounted) return;
  mounted = true;
  const root = document.createElement("div");
  root.id = "apexNotificationRoot";
  document.body.appendChild(root);
  document.addEventListener("click", event => {
    const panel = document.querySelector(".apexNotifyPanel");
    const bell = document.querySelector(".apexNotifyBell");
    if (open && panel && !panel.contains(event.target) && bell && !bell.contains(event.target)) {
      open = false;
      render();
    }
  });
  render();
}

function render() {
  mount();
  const root = document.getElementById("apexNotificationRoot");
  if (!root) return;
  const count = unreadCount();
  const permission = "Notification" in window ? Notification.permission : "unsupported";
  root.innerHTML = `
    <button class="apexNotifyBell" type="button" aria-label="Apex notifications">
      <span>🔔</span>${count ? `<b>${count > 99 ? "99+" : count}</b>` : ""}
    </button>
    <section class="apexNotifyPanel ${open ? "open" : ""}">
      <header><div><strong>Notifications</strong><small>${count} unread</small></div><button class="apexNotifyClose" type="button">×</button></header>
      ${permission !== "granted" && permission !== "unsupported" ? `<button class="apexNotifyEnable" type="button">Enable phone notifications</button>` : ""}
      <div class="apexNotifyList">
        ${items.length ? items.map(item => `<article class="${item.read ? "read" : "unread"}" data-key="${item.key}"><i>${item.icon}</i><div><b>${item.title}</b><p>${item.body}</p></div><time>${formatWhen(item.createdAt)}</time></article>`).join("") : `<div class="apexNotifyEmpty">No notifications yet.</div>`}
      </div>
      <footer><button class="apexNotifyRead" type="button">Mark all read</button><button class="apexNotifyClear" type="button">Clear</button></footer>
    </section>`;
  root.querySelector(".apexNotifyBell")?.addEventListener("click", event => { event.stopPropagation(); open = !open; if (open) markAllRead(); render(); });
  root.querySelector(".apexNotifyClose")?.addEventListener("click", () => { open = false; render(); });
  root.querySelector(".apexNotifyEnable")?.addEventListener("click", requestPermission);
  root.querySelector(".apexNotifyRead")?.addEventListener("click", markAllRead);
  root.querySelector(".apexNotifyClear")?.addEventListener("click", clearAll);
}

onAuthStateChanged(auth, user => {
  unsubscribe.forEach(stop => stop());
  unsubscribe = [];
  if (!user || !ownerUids.includes(user.uid)) return;
  mount();
  unsubscribe = [
    watch("booking", "bookingRequests"),
    watch("inquiry", "inquiries"),
    watch("job", "jobs")
  ];
});
