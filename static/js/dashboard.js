/* ============================================================
   CSRF TOKEN READER
   ============================================================ */
function getCSRFToken() {
  try {
    const name = "X-CSRF-Token=";
    const cookies = decodeURIComponent(document.cookie).split(";");
    for (let c of cookies) {
      c = c.trim();
      if (c.startsWith(name)) return c.substring(name.length);
    }
  } catch (e) {}
  return "";
}

/* ============================================================
   GLOBAL STATE
   ============================================================ */
let allAccounts = [];
let editMode = false;
let editAccountId = null;
let deleteId = null;

/* ============================================================
   CORE ACCOUNT FUNCTIONS
   ============================================================ */

// SHOW PASSWORD
async function togglePassword(id) {
  const pwDiv = document.getElementById(`pw-${id}`);
  if (!pwDiv) return;

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
    pwDiv.textContent = "Error loading password";
  }
}

// COPY PASSWORD
async function copyPassword(id) {
  const res = await fetch(`/api/password/show/${id}`, {
    method: "GET",
    credentials: "include"
  });

  const data = await res.json();

  if (data.success) {
    navigator.clipboard.writeText(data.password);
    //alert("Copied!");
  } else {
    alert("Copy failed");
  }
}

// EDIT ACCOUNT
async function editAccount(id) {
  const acc = allAccounts.find(a => a.id === id);
  if (!acc) return alert("Account not found!");

  const res = await fetch(`/api/password/show/${id}`, {
    method: "GET",
    credentials: "include"
  });

  const data = await res.json();

  document.getElementById("accName").value = acc.account_name;
  document.getElementById("accPassword").value = data.password;

  editMode = true;
  editAccountId = id;

  document.getElementById("saveBtn").textContent = "Update Account";
}

// DELETE ACCOUNT (open modal)
function deleteAccount(id) {
  deleteId = id;
  document.getElementById("deleteModal").style.display = "block";
}

/* ============================================================
   MAIN SCRIPT
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const accountsList = document.getElementById("accountsList");
  const searchInput = document.getElementById("searchInput");

  // Notification helper
  function notify(msg, color = "green") {
    const box = document.createElement("div");
    box.textContent = msg;
    box.style.background = color;
    box.style.color = "white";
    box.style.padding = "10px";
    box.style.marginBottom = "10px";
    box.style.borderRadius = "5px";
    document.querySelector(".container").prepend(box);
    setTimeout(() => box.remove(), 2000);
  }

  /* ============================================================
     LOAD USERNAME
     ============================================================ */
  async function loadUsername() {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    const data = await res.json();

    if (!data.success) {
      window.location.href = "/";
      return;
    }

    document.getElementById("usernameDisplay").textContent = data.username;
  }

  loadUsername();

  /* ============================================================
     LOAD ACCOUNTS
     ============================================================ */
  async function loadAccounts() {
    const res = await fetch("/api/password/list", {
      method: "GET",
      credentials: "include"
    });

    const data = await res.json();

    if (!data.success) {
      notify("Error loading accounts", "red");
      return;
    }

    allAccounts = data.accounts;
    displayAccounts(allAccounts);
  }

  loadAccounts();

  /* ============================================================
     RENDER ACCOUNTS (no onclick here)
     ============================================================ */
  function displayAccounts(accounts) {
    accountsList.innerHTML = "";

    if (!accounts.length) {
      accountsList.innerHTML = "<p>No accounts saved.</p>";
      return;
    }

    accounts.forEach(acc => {
      const box = document.createElement("div");
      box.className = "account-box";
      box.dataset.id = acc.id;

      box.innerHTML = `
        <strong>${acc.account_name}</strong>

        <div class="password-text" id="pw-${acc.id}" style="display:none;"></div>

        <div class="actions">
          <button class="btn-show">Show</button>
          <button class="btn-copy">Copy</button>
          <button class="btn-edit">Edit</button>
          <button class="btn-delete" style="background:red;color:white;">Delete</button>
        </div>
      `;

      accountsList.appendChild(box);
    });
  }

  /* ============================================================
     EVENT DELEGATION (mobile-safe click handling)
     ============================================================ */
  accountsList.addEventListener("click", (e) => {
    const btn = e.target;
    const box = btn.closest(".account-box");
    if (!box) return;

    const id = box.dataset.id;

    if (btn.classList.contains("btn-show")) togglePassword(id);
    else if (btn.classList.contains("btn-copy")) copyPassword(id);
    else if (btn.classList.contains("btn-edit")) editAccount(id);
    else if (btn.classList.contains("btn-delete")) deleteAccount(id);
  });

  /* ============================================================
     SEARCH FILTER
     ============================================================ */
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase();
    const filtered = allAccounts.filter(a =>
      a.account_name.toLowerCase().includes(q)
    );
    displayAccounts(filtered);
  });

  /* ============================================================
     DELETE CONFIRMATION
     ============================================================ */
  document.getElementById("confirmDelete").onclick = async () => {
    const res = await fetch(`/api/password/delete/${deleteId}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "X-CSRF-Token": getCSRFToken() }
    });

    const data = await res.json();

    if (data.success) {
      notify("Deleted");
      loadAccounts();
    } else {
      notify("Delete failed", "red");
    }

    document.getElementById("deleteModal").style.display = "none";
  };

  document.getElementById("cancelDelete").onclick = () => {
    document.getElementById("deleteModal").style.display = "none";
    deleteId = null;
  };

  /* ============================================================
     SAVE / UPDATE ACCOUNT
     ============================================================ */
  document.getElementById("saveBtn").onclick = async () => {
    const name = document.getElementById("accName").value.trim();
    const password = document.getElementById("accPassword").value.trim();

    if (!name || !password) return notify("Required fields", "red");

    // Update
    if (editMode) {
      const res = await fetch(`/api/password/edit/${editAccountId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCSRFToken()
        },
        body: JSON.stringify({ account_name: name, account_password: password })
      });

      const data = await res.json();

      if (data.success) {
        notify("Updated!");
        editMode = false;
        editAccountId = null;
        document.getElementById("saveBtn").textContent = "Save Account";
        document.getElementById("accName").value = "";
        document.getElementById("accPassword").value = "";
        loadAccounts();
      } else {
        notify("Update failed", "red");
      }

      return;
    }

    // Create
    const res = await fetch("/api/password/add", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": getCSRFToken()
      },
      body: JSON.stringify({ account_name: name, account_password: password })
    });

    const data = await res.json();

    if (data.success) {
      notify("Saved!");
      document.getElementById("accName").value = "";
      document.getElementById("accPassword").value = "";
      loadAccounts();
    } else {
      notify("Error saving", "red");
    }
  };

  /* ============================================================
     LOGOUT
     ============================================================ */
  document.getElementById("logoutBtn").onclick = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": getCSRFToken() }
    });

    window.location.href = "/";
  };
});
