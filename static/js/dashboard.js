/* ============================================================
   CSRF TOKEN READER
   ============================================================ */
function getCSRFToken() {
  const name = "X-CSRF-Token=";
  const cookies = decodeURIComponent(document.cookie).split(";");

  for (let c of cookies) {
    c = c.trim();
    if (c.startsWith(name)) {
      return c.substring(name.length);
    }
  }
  return "";
}

/* ============================================================
   MAIN SCRIPT
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {

  /* ============================================================
     Notification Toast
     ============================================================ */
  function notify(message, color = "green") {
    const box = document.createElement("div");
    box.textContent = message;
    box.style.background = color;
    box.style.color = "white";
    box.style.padding = "8px";
    box.style.marginBottom = "10px";
    box.style.borderRadius = "5px";
    box.style.transition = "all 0.5s";
    document.querySelector(".container").prepend(box);
    setTimeout(() => box.remove(), 2000);
  }

  /* ============================================================
     Password Strength Meter
     ============================================================ */
  function checkStrength(password) {
    let score = 0;

    if (password.length > 6) score++;
    if (password.length > 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    switch (score) {
      case 0:
      case 1: return { text: "Weak", color: "red" };
      case 2: return { text: "Fair", color: "orange" };
      case 3: return { text: "Good", color: "blue" };
      case 4:
      case 5: return { text: "Strong", color: "green" };
      default: return { text: "Weak", color: "red" };
    }
  }

  const accPassword = document.getElementById("accPassword");
  const strengthBox = document.getElementById("strengthBox");

  if (accPassword && strengthBox) {
    accPassword.addEventListener("input", (e) => {
      const pwd = e.target.value;
      const strength = checkStrength(pwd);

      if (pwd === "") {
        strengthBox.innerHTML = "";
        return;
      }

      strengthBox.innerHTML =
        `Strength: <span style="color:${strength.color}">${strength.text}</span>`;
    });
  }

  /* ============================================================
     API BASE URL
     ============================================================ */
  const API_PASSWORD_URL = "/api/password";

  /* ============================================================
     Load Username
     ============================================================ */
  async function loadUsername() {
    try {
      const res = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include"
      });

      const data = await res.json();
      if (data.success) {
        document.getElementById("usernameDisplay").textContent = data.username;
      } else {
        window.location.href = "/";
      }
    } catch (err) {
      window.location.href = "/";
    }
  }

  loadUsername();

  /* ============================================================
     Load Accounts
     ============================================================ */
  const accountsList = document.getElementById("accountsList");
  const searchInput = document.getElementById("searchInput");

  let allAccounts = [];
  let editMode = false;
  let editAccountId = null;

  async function loadAccounts() {
    try {
      const response = await fetch(`${API_PASSWORD_URL}/list`, {
        method: "GET",
        credentials: "include"
      });

      const data = await response.json();

      if (data.success) {
        allAccounts = data.accounts;   // IMPORTANT FIX
        displayAccounts(allAccounts);
      } else {
        notify("Error loading accounts", "red");
      }

    } catch (err) {
      notify("Server error loading accounts", "red");
    }
  }

  loadAccounts();

  /* ============================================================
     DISPLAY ACCOUNTS
     ============================================================ */
  function displayAccounts(accounts) {
    accountsList.innerHTML = "";

    if (accounts.length === 0) {
      accountsList.innerHTML = "<p>No accounts found.</p>";
      return;
    }

    accounts.forEach(acc => {
      const box = document.createElement("div");
      box.className = "account-box";

      box.innerHTML = `
        <strong>${acc.account_name}</strong>

        <div class="password-text" id="pw-${acc.id}" style="display:none;">
          Loading...
        </div>

        <div class="actions">
          <button onclick="togglePassword('${acc.id}')">Show</button>
          <button onclick="copyPassword('${acc.id}')">Copy</button>
          <button onclick="editAccount('${acc.id}')">Edit</button>
          <button onclick="deleteAccount('${acc.id}')" style="background:red;color:white;">Delete</button>
        </div>
      `;

      accountsList.appendChild(box);
    });
  }

  /* ============================================================
     SEARCH ACCOUNTS
     ============================================================ */
  searchInput.addEventListener("input", () => {
    const txt = searchInput.value.toLowerCase();
    const filtered = allAccounts.filter(a =>
      a.account_name.toLowerCase().includes(txt)
    );
    displayAccounts(filtered);
  });

  /* ============================================================
     SHOW PASSWORD
     ============================================================ */
  window.togglePassword = async (id) => {
    const pwDiv = document.getElementById(`pw-${id}`);

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
  };

  /* ============================================================
     COPY PASSWORD
     ============================================================ */
  window.copyPassword = async (id) => {
    const res = await fetch(`/api/password/show/${id}`, {
      method: "GET",
      credentials: "include"
    });

    const data = await res.json();

    if (data.success) {
      navigator.clipboard.writeText(data.password);
      notify("Password copied!");
    }
  };

  /* ============================================================
     EDIT ACCOUNT
     ============================================================ */
  window.editAccount = async (id) => {
    const acc = allAccounts.find(a => a.id === id);

    const res = await fetch(`/api/password/show/${id}`, {
      method: "GET",
      credentials: "include"
    });

    const decrypted = await res.json();

    document.getElementById("accName").value = acc.account_name;
    document.getElementById("accPassword").value = decrypted.password;

    editMode = true;
    editAccountId = id;

    document.getElementById("saveBtn").textContent = "Update Account";
  };

  /* ============================================================
     DELETE ACCOUNT
     ============================================================ */
  let deleteId = null;

  window.deleteAccount = (id) => {
    deleteId = id;
    document.getElementById("deleteModal").style.display = "flex";
  };

  document.getElementById("cancelDelete").onclick = () => {
    deleteId = null;
    document.getElementById("deleteModal").style.display = "none";
  };

  document.getElementById("confirmDelete").onclick = async () => {

    if (!deleteId) return;

    const res = await fetch(`${API_PASSWORD_URL}/delete/${deleteId}`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "X-CSRF-Token": getCSRFToken()
      }
    });

    const data = await res.json();

    if (data.success) {
      notify("Deleted");
      loadAccounts();
    }

    document.getElementById("deleteModal").style.display = "none";
  };

  /* ============================================================
     SAVE OR UPDATE ACCOUNT
     ============================================================ */
  document.getElementById("saveBtn").onclick = async () => {

    const name = document.getElementById("accName").value.trim();
    const password = document.getElementById("accPassword").value.trim();

    if (!name || !password) {
      notify("Both fields required", "red");
      return;
    }

    // UPDATE MODE
    if (editMode) {

      const res = await fetch(`${API_PASSWORD_URL}/edit/${editAccountId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCSRFToken()
        },
        body: JSON.stringify({
          account_name: name,
          account_password: password
        })
      });

      const data = await res.json();

      if (data.success) {
        notify("Updated!");
        editMode = false;
        editAccountId = null;

        document.getElementById("accName").value = "";
        document.getElementById("accPassword").value = "";
        document.getElementById("saveBtn").textContent = "Save Account";

        loadAccounts();
      }

      return;
    }

    // NORMAL SAVE MODE
    const res = await fetch(`${API_PASSWORD_URL}/add`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": getCSRFToken()
      },
      body: JSON.stringify({
        account_name: name,
        account_password: password
      })
    });

    const data = await res.json();

    if (data.success) {
      notify("Saved!");
      document.getElementById("accName").value = "";
      document.getElementById("accPassword").value = "";
      loadAccounts();
    }
  };

  /* ============================================================
     LOGOUT
     ============================================================ */
  document.getElementById("logoutBtn").onclick = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        "X-CSRF-Token": getCSRFToken()
      }
    });

    window.location.href = "/";
  };

});
    
