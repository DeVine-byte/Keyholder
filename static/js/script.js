
document.addEventListener("DOMContentLoaded", () => {
  // Modal open/close
  const authBtn = document.getElementById("authBtn");
  const modal = document.getElementById("authModal");
  const closeBtn = document.querySelector(".close");

  if (authBtn) authBtn.onclick = () => (modal.style.display = "block");
  if (closeBtn) closeBtn.onclick = () => (modal.style.display = "none");
  window.onclick = (e) => {
    if (e.target === modal) modal.style.display = "none";
  };

  // Tabs
  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  if (loginTab && registerTab && loginForm && registerForm) {
    loginTab.onclick = () => {
      loginTab.classList.add("active");
      registerTab.classList.remove("active");
      loginForm.classList.add("active");
      registerForm.classList.remove("active");
    };
    registerTab.onclick = () => {
      registerTab.classList.add("active");
      loginTab.classList.remove("active");
      registerForm.classList.add("active");
      loginForm.classList.remove("active");
    };
  }

  const API_URL = "/api/auth";

  // Small notifier
  function notify(msg, color = "green") {
    const box = document.createElement("div");
    box.textContent = msg;
    box.style.background = color;
    box.style.color = "white";
    box.style.padding = "8px";
    box.style.marginBottom = "10px";
    box.style.borderRadius = "5px";
    document.body.prepend(box);
    setTimeout(() => box.remove(), 2500);
  }

  // Register
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const username = document.getElementById("registerUsername").value.trim();
      const email = document.getElementById("registerEmail").value.trim();
      const password = document.getElementById("registerPassword").value.trim();

      if (!username || !email || !password) {
        notify("All fields required", "red");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/register`, {
          method: "POST",
          credentials: "include", // IMPORTANT: sends HttpOnly cookie
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          // server set HttpOnly cookie; store only username in sessionStorage (non-sensitive)
          sessionStorage.setItem("username", data.username || username);
          notify("Registration successful — redirecting...", "green");
          window.location.href = "/dashboard";
        } else {
          notify(data.message || "Registration failed", "red");
        }
      } catch (err) {
        console.error(err);
        notify("Unable to connect to server", "red");
      }
    });
  }

  // Login
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value.trim();

      if (!email || !password) {
        notify("Both fields required", "red");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/login`, {
          method: "POST",
          credentials: "include", // IMPORTANT
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          sessionStorage.setItem("username", data.username || "");
          notify("Login successful — redirecting...", "green");
          window.location.href = "/dashboard";
        } else {
          notify(data.message || "Login failed", "red");
        }
      } catch (err) {
        console.error(err);
        notify("Unable to connect to server", "red");
      }
    });
  }
});
