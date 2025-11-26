/* ============================================================
   CSRF TOKEN READER
   ============================================================ */
function getCSRFToken() {
  try {
    const name = "X-CSRF-Token=";
    const cookies = decodeURIComponent(document.cookie || "").split(";");
    for (let c of cookies) {
      c = c.trim();
      if (c.startsWith(name)) return c.substring(name.length);
    }
  } catch (e) {
    console.error("CSRF read error:", e);
  }
  return "";
}

/* ============================================================
   GLOBAL STATE
   ============================================================ */
window._KH = window._KH || {};
window._KH.allAccounts = [];
window._KH.editMode = false;
window._KH.editAccountId = null;
window._KH.deleteId = null;

/* ============================================================
   GLOBAL ACTIONS (exposed for inline onclick in HTML)
   ============================================================ */
window.togglePassword = async function (id) {
  try {
    const pwDiv = document.getElementById(`pw-${id}`);
    if (!pwDiv) {
      console.warn("pw div not found for", id);
      return;
    }

    if (pwDiv.style.display === "block") {
      pwDiv.style.display = "none";
      return;
    }

    pwDiv.textContent = "Decrypting...";

    const res = await fetch(`/api/password/show/${id}`, {
      method: "GET",
      credentials: "include"
    });

    const data = await res.json();

    if (data.success) {
      pwDiv.textContent = "Password: " + data.password;
      pwDiv.style.display = "block";
    } else {
      pwDiv.textContent = data.message || "Error loading password";
    }
  } catch (err) {
    console.error("togglePassword error:", err);
    alert("Error showing password (see console).");
  }
};

window.copyPassword = async function (id) {
  try {
    const res = await fetch(`/api/password/show/${id}`, {
      method: "GET",
      credentials: "include"
    });

    const data = await res.json();

    if (data.success) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(data.password);
        alert("Password copied to clipboard");
      } else {
        // fallback
        const ta = document.createElement("textarea");
        ta.value = data.password;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        alert("Password copied to clipboard (fallback)");
      }
    } else {
      alert(data.message || "Could not copy password");
    }
  } catch (err) {
    console.error("copyPassword error:", err);
    alert("Copy failed (see console).");
  }
};

window.editAccount = async function (id) {
  try {
    const acc = window._KH.allAccounts.find(a => a.id === id);
    if (!acc) {
      alert("Account not found");
      return;
    }

    const res = await fetch(`/api/password/show/${id}`, {
      method: "GET",
      credentials: "include"
    });
    const data = await res.json();

    if (!data.success) {
      alert(data.message || "Could not fetch account password");
      return;
    }

    const nameEl = document.getElementById("accName");
    const passEl = document.getElementById("accPassword");
    if (nameEl) nameEl.value = acc.account_name || "";
    if (passEl) passEl.value = data.password || "";

    window._KH.editMode = true;
    window._KH.editAccountId = id;

    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) saveBtn.textContent = "Update Account";
  } catch (err) {
    console.error("editAccount error:", err);
    alert("Edit failed (see console).");
  }
};

window.deleteAccount = function (id) {
  window._KH.deleteId = id;
  const modal = document.getElementById("deleteModal");
  if (modal) {
    // use block so any CSS works; center in CSS if needed
    modal.style.display = "block";
  } else {
    alert("Delete modal not found");
  }
};

/* ============================================================
   MAIN — runs after DOM ready
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  // helper: safe get
  const $ = id => document.getElementById(id);

  // graceful no-container guard
  const container = document.querySelector(".container") || document.body;

  function notify(message, color = "green") {
    try {
      const box = document.createElement("div");
      box.textContent = message;
      box.style.background = color;
      box.style.color = "white";
      box.style.padding = "8px";
      box.style.marginBottom = "10px";
      box.style.borderRadius = "5px";
      container.prepend(box);
      setTimeout(() => box.remove(), 1800);
    } catch (e) {
      console.log("notify:", message);
    }
  }

  // Elements (may be null if HTML changed)
  const accNameEl = $("accName");
  const accPasswordEl = $("accPassword");
  const strengthBox = $("strengthBox");
  const accountsList = $("accountsList");
  const searchInput = $("searchInput");
  const saveBtn = $("saveBtn");
  const logoutBtn = $("logoutBtn");
  const usernameDisplay = $("usernameDisplay");
  const cancelDeleteBtn = $("cancelDelete");
  const confirmDeleteBtn = $("confirmDelete");
  const deleteModal = $("deleteModal");

  // Password strength (safe)
  function checkStrength(password) {
    let score = 0;
    if (!password) return { text: "", color: "" };
    if (password.length > 6) score++;
    if (password.length > 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { text: "Weak", color: "red" };
    if (score === 2) return { text: "Fair", color: "orange" };
    if (score === 3) return { text: "Good", color: "blue" };
    return { text: "Strong", color: "green" };
  }

  if (accPasswordEl && strengthBox) {
    accPasswordEl.addEventListener("input", e => {
      const s = checkStrength(e.target.value);
      strengthBox.innerHTML = s.text ? `Strength: <span style="color:${s.color}">${s.text}</span>` : "";
    });
  }

  const API_PASSWORD_URL = "/api/password";

  // load username
  (async function loadUsername() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const data = await res.json();
      if (data && data.success) {
        if (usernameDisplay) usernameDisplay.textContent = data.username || "";
      } else {
        // not authenticated - redirect to home
        window.location.href = "/";
      }
    } catch (err) {
      console.error("loadUsername error:", err);
      window.location.href = "/";
    }
  })();

  // load accounts
  async function loadAccounts() {
    try {
      const res = await fetch(`${API_PASSWORD_URL}/list`, { credentials: "include" });
      const data = await res.json();
      if (data && data.success) {
        window._KH.allAccounts = data.accounts || [];
        renderAccounts(window._KH.allAccounts);
      } else {
        notify(data.message || "Error loading accounts", "red");
        console.warn("loadAccounts response:", data);
      }
    } catch (err) {
      console.error("loadAccounts error:", err);
      notify("Server error loading accounts", "red");
    }
  }

  function renderAccounts(accounts) {
    if (!accountsList) return;
    accountsList.innerHTML = "";
    if (!accounts || accounts.length === 0) {
      accountsList.innerHTML = "<p>No accounts found.</p>";
      return;
    }

    accounts.forEach(acc => {
      const box = document.createElement("div");
      box.className = "account-box";

      // note: keep buttons inline and call global functions
      box.innerHTML = `
        <strong>${escapeHtml(acc.account_name || "Unnamed")}</strong>
        <div class="password-text" id="pw-${acc.id}" style="display:none;"></div>
        <div class="actions">
          <button type="button" onclick="togglePassword('${acc.id}')">Show</button>
          <button type="button" onclick="copyPassword('${acc.id}')">Copy</button>
          <button type="button" onclick="editAccount('${acc.id}')">Edit</button>
          <button type="button" onclick="deleteAccount('${acc.id}')" style="background:red;color:white;">Delete</button>
        </div>
      `;
      accountsList.appendChild(box);
    });
  }

  // simple escaper
  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"'`=\/]/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#47;', '`':'&#96;', '=':'&#61;'
    })[s]);
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = (searchInput.value || "").toLowerCase();
      const filtered = (window._KH.allAccounts || []).filter(a => (a.account_name || "").toLowerCase().includes(q));
      renderAccounts(filtered);
    });
  }

  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener("click", () => {
      window._KH.deleteId = null;
      if (deleteModal) deleteModal.style.display = "none";
    });
  }

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
      const id = window._KH.deleteId;
      if (!id) return;
      try {
        const res = await fetch(`${API_PASSWORD_URL}/delete/${id}`, {
          method: "DELETE",
          credentials: "include",
          headers: { "X-CSRF-Token": getCSRFToken() }
        });
        const data = await res.json();
        if (data && data.success) {
          notify("Deleted!", "green");
          await loadAccounts();
        } else {
          notify(data.message || "Delete failed", "red");
        }
      } catch (err) {
        console.error("confirmDelete error:", err);
        notify("Delete error (see console)", "red");
      } finally {
        if (deleteModal) deleteModal.style.display = "none";
        window._KH.deleteId = null;
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const name = accNameEl ? accNameEl.value.trim() : "";
      const password = accPasswordEl ? accPasswordEl.value.trim() : "";
      if (!name || !password) {
        notify("Both fields required", "red");
        return;
      }

      // update
      if (window._KH.editMode && window._KH.editAccountId) {
        try {
          const res = await fetch(`${API_PASSWORD_URL}/edit/${window._KH.editAccountId}`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
            body: JSON.stringify({ account_name: name, account_password: password })
          });
          const data = await res.json();
          if (data && data.success) {
            notify("Updated!", "green");
            window._KH.editMode = false;
            window._KH.editAccountId = null;
            if (accNameEl) accNameEl.value = "";
            if (accPasswordEl) accPasswordEl.value = "";
            if (saveBtn) saveBtn.textContent = "Save Account";
            await loadAccounts();
          } else {
            notify(data.message || "Update failed", "red");
          }
        } catch (err) {
          console.error("save update error:", err);
          notify("Update error (see console)", "red");
        }
        return;
      }

      // create new
      try {
        const res = await fetch(`${API_PASSWORD_URL}/add`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
          body: JSON.stringify({ account_name: name, account_password: password })
        });
        const data = await res.json();
        if (data && data.success) {
          notify("Saved!", "green");
          if (accNameEl) accNameEl.value = "";
          if (accPasswordEl) accPasswordEl.value = "";
          await loadAccounts();
        } else {
          notify(data.message || "Save failed", "red");
        }
      } catch (err) {
        console.error("save error:", err);
        notify("Save error (see console)", "red");
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRF-Token": getCSRFToken() }
        });
      } catch (e) {
        console.error("logout error:", e);
      } finally {
        window.location.href = "/";
      }
    });
  }

  // initial load
  loadAccounts();
});
                           
