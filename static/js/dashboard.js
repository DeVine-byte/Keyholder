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

  // --- Small Notice UI (replaces alert) ---
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

  // ---- PASSWORD STRENGTH METER ----
  document.getElementById("accPassword").addEventListener("input", (e) => {
    const strength = checkStrength(e.target.value);
    const box = document.getElementById("strengthBox");

    if (e.target.value === "") {
      box.innerHTML = "";
      return;
    }

    box.innerHTML = `Strength: <span style="color:${strength.color}">${strength.text}</span>`;
  });

  const API_PASSWORD_URL = "/api/password";

  const token = localStorage.getItem("authToken");
  const username = localStorage.getItem("username");

  if (!token) {
    notify("You must log in first!", "red");
    window.location.href = "/";
    return;
  }

  const authHeader = "Bearer " + token;

  document.getElementById("usernameDisplay").textContent = username;

  const saveBtn = document.getElementById("saveBtn");
  const accountsList = document.getElementById("accountsList");
  const searchInput = document.getElementById("searchInput");

  let allAccounts = [];
  let editMode = false;
  let editAccountId = null;

  // ---- LOAD ACCOUNTS ----
  async function loadAccounts() {
    try {
      const response = await fetch(`${API_PASSWORD_URL}/list`, {
        method: "GET",
        headers: { "Authorization": authHeader }
      });

      const data = await response.json();

      if (data.success) {
        allAccounts = data.accounts;
        displayAccounts(allAccounts);
      } else {
        notify("Failed to load accounts", "red");
      }

    } catch (err) {
      notify("Server error loading accounts.", "red");
    }
  }

  loadAccounts();


  // ---- DISPLAY ACCOUNTS ----
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
        <div class="password-text" id="pw-${acc.id}">
          Password: ${acc.account_password}
        </div>
        <div class="actions">
          <button onclick="togglePassword(${acc.id})">Show</button>
          <button onclick="copyPassword(${acc.id})">Copy</button>
          <button onclick="editAccount(${acc.id})">Edit</button>
          <button onclick="deleteAccount(${acc.id})" style="background:red;color:white;">Delete</button>
        </div>
      `;

      accountsList.appendChild(box);
    });
  }

  // ---- SEARCH ----
  searchInput.addEventListener("input", () => {
    const text = searchInput.value.toLowerCase();
    const filtered = allAccounts.filter(a =>
      a.account_name.toLowerCase().includes(text)
    );
    displayAccounts(filtered);
  });

  // ---- SHOW/HIDE PASSWORD ----
  window.togglePassword = (id) => {
    const pwDiv = document.getElementById(`pw-${id}`);
    pwDiv.style.display = pwDiv.style.display === "none" ? "block" : "none";
  };

  // ---- COPY PASSWORD ----
  window.copyPassword = (id) => {
    const pwDiv = document.getElementById(`pw-${id}`);
    const text = pwDiv.textContent.replace("Password: ", "");
    navigator.clipboard.writeText(text).then(() =>
      notify("Password copied!")
    );
  };

  // ---- EDIT ACCOUNT (new workflow) ----
  window.editAccount = (id) => {
    const account = allAccounts.find(a => a.id === id);

    document.getElementById("accName").value = account.account_name;
    document.getElementById("accPassword").value = account.account_password;

    editMode = true;
    editAccountId = id;
    saveBtn.textContent = "Update Account";

    notify("Editing mode enabled", "blue");
  };

  // ---- DELETE ACCOUNT ----
  let deleteId = null;

window.deleteAccount = (id) => {
  deleteId = id;
  document.getElementById("deleteModal").style.display = "flex";
};

document.getElementById("cancelDelete").addEventListener("click", () => {
  deleteId = null;
  document.getElementById("deleteModal").style.display = "none";
});

document.getElementById("confirmDelete").addEventListener("click", async () => {
  if (!deleteId) return;

  try {
    const response = await fetch(`${API_PASSWORD_URL}/delete/${deleteId}`, {
      method: "DELETE",
      headers: { "Authorization": authHeader }
    });

    const data = await response.json();

    if (data.success) {
      notify("Account deleted!");
      loadAccounts();
    }

  } catch (error) {
    notify("Error deleting account.", "red");
  }

  deleteId = null;
  document.getElementById("deleteModal").style.display = "none";
});


  // ---- SAVE OR UPDATE ACCOUNT ----
  saveBtn.addEventListener("click", async () => {
    const name = document.getElementById("accName").value.trim();
    const password = document.getElementById("accPassword").value.trim();

    if (!name || !password) {
      notify("Both fields required!", "red");
      return;
    }

    // ---- UPDATE MODE ----
    if (editMode) {
      try {
        const response = await fetch(`${API_PASSWORD_URL}/edit/${editAccountId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader
          },
          body: JSON.stringify({
            account_name: name,
            account_password: password
          })
        });

        const data = await response.json();

        if (data.success) {
          notify("Account updated!");
          editMode = false;
          editAccountId = null;
          saveBtn.textContent = "Save Account";
          document.getElementById("accName").value = "";
          document.getElementById("accPassword").value = "";
          loadAccounts();
        }

      } catch (error) {
        notify("Update failed!", "red");
      }

      return;
    }

    // ---- NORMAL SAVE MODE ----
    try {
      const response = await fetch(`${API_PASSWORD_URL}/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader
        },
        body: JSON.stringify({
          account_name: name,
          account_password: password
        })
      });

      const data = await response.json();

      if (data.success) {
        notify("Account saved!");
        document.getElementById("accName").value = "";
        document.getElementById("accPassword").value = "";
        loadAccounts();
      }

    } catch (error) {
      notify("Server error.", "red");
    }
  });

  // ---- LOGOUT ----
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("username");
    window.location.href = "/";
  });

});
