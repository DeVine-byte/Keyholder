document.addEventListener("DOMContentLoaded", () => {
  // Handle modal open/close
  const authBtn = document.getElementById("authBtn");
  const modal = document.getElementById("authModal");
  const closeBtn = document.querySelector(".close");

  if (authBtn) {
    authBtn.onclick = () => (modal.style.display = "block");
  }
  if (closeBtn) {
    closeBtn.onclick = () => (modal.style.display = "none");
  }
  window.onclick = (e) => {
    if (e.target === modal) modal.style.display = "none";
  };

  // Handle tab switching
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

  // Connect to backend API
  const API_URL = "/api/auth";

  // Handle Registration
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const username = document.getElementById("registerUsername").value.trim();
      const email = document.getElementById("registerEmail").value.trim();
      const password = document.getElementById("registerPassword").value.trim();

      try {
        const response = await fetch(`${API_URL}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          localStorage.setItem("authToken", data.token);
          localStorage.setItem("username", data.username);
          window.location.href = "/dashboard";
        } else {
          alert(data.message || "Registration failed!");
        }
      } catch (error) {
        console.error("Error:", error);
        alert("Unable to connect to server. Please try again later.");
      }
    });
  }

  // Handle Login
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value.trim();

      try {
        const response = await fetch(`${API_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          localStorage.setItem("authToken", data.token);
          localStorage.setItem("username", data.username);
          window.location.href = "/dashboard";
        } else {
          alert(data.message || "Login failed!");
        }
      } catch (error) {
        console.error("Error:", error);
        alert("Unable to connect to server. Please try again later.");
      }
    });
  }
});
