
function checkStrength(password) {
  let score = 0;
  if (password.length > 6) score++;
  if (password.length > 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  switch (score) {
    case 0:
    case 1:
      return { text: "Weak", color: "red" };
    case 2:
      return { text: "Fair", color: "orange" };
    case 3:
      return { text: "Good", color: "blue" };
    case 4:
    case 5:
      return { text: "Strong", color: "green" };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // notifier
  function notify(message, color = "green") {
    const box = document.createElement("div");
    box.textContent = message;
    box.style.background = color;
    box.style.color = "white";
    box.style.padding = "8px";
    box.style.marginBottom = "10px";
    box.style.borderRadius = "5px";
    document.querySelector(".container").prepend(box);
    setTimeout(() => box.remove(), 2000);
  }

  // strength meter
  const pwInput = document.getElementById("accPassword");
  const strengthBox = document.getElementById("strengthBox");
  if (pwInput) {
    pwInput.addEventListener("input", (e) => {
      const strength = checkStrength(e.target.value);
      if (!e.target.value) {
        strengthBox.textContent = "";
        return;
      }
      strengthBox.innerHTML = `Strength: <span style="color:${strength.color}">${strength.text}</span>`;
    });
  }

  const API_PASSWORD_URL = "/api/password";
  const username = sessionStorage.getItem("username") || "";

  // If username not available in sessionStorage, try to show blank and allow usage
  if (username) {
    const usernameDisplay = document.getElementById("usernameDisplay");
    if (usernameDisplay) usernameDisplay.textContent = username;
  }

  const saveBtn = document.getElementById("saveBtn");
  const accountsList = document.getElementById("accountsList");
  const searchInput = document.getElementById("searchInput");

  let allAccounts = [];
  let editMode = false;
  let editAccountId = null;

  // load metadata (id + name only)
  async function loadAccounts() {
    try {
      const res = await fetch(`${API_PASSWORD_URL}/list`, {
        method: "GET",
        credentials: "include" // send cookie
      });
      const data = await res.json();
      if (res.ok && data.success) {
        allAccounts = data.accounts || [];
        displayAccounts(allAccounts);
      } else {
        notify(data.message || "Failed to load accounts", "red");
      }
    } catch (err) {
      console.error(err);
      notify("Server error loading accounts", "red");
    }
  }

  loadAccounts();

  // create account DOM safely
  function createAccountElement(acc) {
    const box = document.createElement("div");
    box.className = "account-box";

    const title = document.createElement("strong");
    title.textContent = acc.account_name || "Unnamed";

    // password area (hidden until requested)
    const pwDiv = document.createElement("div");
    pwDiv.className = "password-text";
    pwDiv.id = `pw-${acc.id}`;
    pwDiv.style.display = "none";
    pwDiv.textContent = ""; // will be filled on-demand

    // actions
    const actions = document.createElement("div");
    actions.className = "actions";

    const showBtn = document.createElement("button");
    showBtn.textContent = "Show";
    showBtn.addEventListener("click", () => fetchAndTogglePassword(acc.id));

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => copyPassword(acc.id));

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => enterEditMode(acc.id));

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.style.background = "red";
    delBtn.style.color = "white";
    delBtn.addEventListener("click", () => openDeleteModal(acc.id));

    actions.appendChild(showBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    box.appendChild(title);
    box.appendChild(pwDiv);
    box.appendChild(actions);

    return box;
  }

  function displayAccounts(accounts) {
    accountsList.innerHTML = "";
    if (!accounts || accounts.length === 0) {
      accountsList.innerHTML = "<p>No accounts found.</p>";
      return;
    }
    accounts.forEach(acc => {
      accountsList.appendChild(createAccountElement(acc));
    });
  }

  // SEARCH
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const text = searchInput.value.toLowerCase();
      const filtered = allAccounts.filter(a => a.account_name.toLowerCase().includes(text));
      displayAccounts(filtered);
    });
  }

  // FETCH single password and toggle display
  async function fetchAndTogglePassword(id) {
    const pwDiv = document.getElementById(`pw-${id}`);
    if (!pwDiv) return;

    // if already visible, hide
    if (pwDiv.style.display === "block") {
      pwDiv.style.display = "none";
      pwDiv.textContent = "";
      return;
    }

    // fetch single password
    try {
      pwDiv.textContent = "Loading...";
      pwDiv.style.display = "block";

      const res = await fetch(`${API_PASSWORD_URL}/show/${id}`, {
        method: "GET",
        credentials: "include"
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // show plaintext securely
        pwDiv.textContent = `Password: ${data.password}`;
      } else {
        pwDiv.textContent = "";
        notify(data.message || "Could not retrieve password", "red");
      }
    } catch (err) {
      console.error(err);
      pwDiv.textContent = "";
      notify("Server error retrieving password", "red");
    }
  }

  // COPY password (fetch if not already loaded)
  async function copyPassword(id) {
    const pwDiv = document.getElementById(`pw-${id}`);
    if (!pwDiv) return;

    // if content empty, fetch first
    if (!pwDiv.textContent) {
      await fetchAndTogglePassword(id);
    }

    const text = pwDiv.textContent.replace("Password: ", "");
    if (!text) {
      notify("No password to copy", "red");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      notify("Password copied!");
    } catch (err) {
      console.error(err);
      notify("Clipboard error", "red");
    }
  }

  // EDIT - enter edit mode, fetch password first to prefill
  async function enterEditMode(id) {
    const acc = allAccounts.find(a => a.id === id);
    if (!acc) return;

    // fetch current password to prefill
    try {
      const res = await fetch(`${API_PASSWORD_URL}/show/${id}`, {
        method: "GET",
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        document.getElementById("accName").value = acc.account_name;
        document.getElementById("accPassword").value = data.password;
        editMode = true;
        editAccountId = id;
        saveBtn.textContent = "Update Account";
        notify("Editing mode enabled", "blue");
      } else {
        notify(data.message || "Could not fetch password", "red");
      }
    } catch (err) {
      console.error(err);
      notify("Server error", "red");
    }
  }

  // DELETE modal workflow
  let deleteId = null;
  function openDeleteModal(id) {
    deleteId = id;
    document.getElementById("deleteModal").style.display = "flex";
  }

  const cancelDelete = document.getElementById("cancelDelete");
  const confirmDelete = document.getElementById("confirmDelete");
  if (cancelDelete) {
    cancelDelete.addEventListener("click", () => {
      deleteId = null;
      document.getElementById("deleteModal").style.display = "none";
    });
  }
  if (confirmDelete) {
    confirmDelete.addEventListener("click", async () => {
      if (!deleteId) return;
      try {
        const res = await fetch(`${API_PASSWORD_URL}/delete/${deleteId}`, {
          method: "DELETE",
          credentials: "include"
        });
        const data = await res.json();
        if (res.ok && data.success) {
          notify("Account deleted!");
          loadAccounts();
        } else {
          notify(data.message || "Delete failed", "red");
        }
      } catch (err) {
        console.error(err);
        notify("Server error", "red");
      }
      deleteId = null;
      document.getElementById("deleteModal").style.display = "none";
    });
  }

  // SAVE / UPDATE
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const name = document.getElementById("accName").value.trim();
      const password = document.getElementById("accPassword").value.trim();

      if (!name || !password) {
        notify("Both fields required!", "red");
        return;
      }

      // UPDATE
      if (editMode && editAccountId) {
        try {
          const res = await fetch(`${API_PASSWORD_URL}/edit/${editAccountId}`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_name: name, account_password: password })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            notify("Account updated!");
            editMode = false;
            editAccountId = null;
            saveBtn.textContent = "Save Account";
            document.getElementById("accName").value = "";
            document.getElementById("accPassword").value = "";
            loadAccounts();
          } else {
            notify(data.message || "Update failed", "red");
          }
        } catch (err) {
          console.error(err);
          notify("Server error", "red");
        }
        return;
      }

      // CREATE
      try {
        const res = await fetch(`${API_PASSWORD_URL}/add`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_name: name, account_password: password })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          notify("Account saved!");
          document.getElementById("accName").value = "";
          document.getElementById("accPassword").value = "";
          loadAccounts();
        } else {
          notify(data.message || "Save failed", "red");
        }
      } catch (err) {
        console.error(err);
        notify("Server error", "red");
      }
    });
  }

  // LOGOUT - call server to destroy cookie + clear sessionStorage
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include"
        });
        if (res.ok) {
          sessionStorage.removeItem("username");
          notify("Logged out");
          window.location.href = "/";
        } else {
          notify("Logout failed", "red");
        }
      } catch (err) {
        console.error(err);
        notify("Logout error", "red");
      }
    });
  }

});
        
