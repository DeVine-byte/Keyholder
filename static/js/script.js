
//  CSRF TOKEN READER
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

document.addEventListener("DOMContentLoaded", () => {

  // ---------------------------
  //  Modal Handling
  // ---------------------------
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

  // ---------------------------
  //  Tab Switching
  // ---------------------------
  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  if (loginTab && registerTab) {
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

  // ---------------------------
  //  API Endpoint
  // ---------------------------
  const API_URL = "/api/auth";


  // ---------------------------
  //  REGISTER
  // ---------------------------
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const username = document.getElementById("registerUsername").value.trim();
      const email = document.getElementById("registerEmail").value.trim();
      const password = document.getElementById("registerPassword").value.trim();

      try {
        const response = await fetch(`${API_URL}/register`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCSRFToken()
          },
          body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();
        if (response.ok && data.success) {
          window.location.href = "/dashboard";
        } else {
          console.log(data.message || "Registration failed.");
        }
      } catch (err) {
        console.log("Server connection failed.");
      }
    });
  }


  // ---------------------------
  //  LOGIN
  // ---------------------------
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value.trim();

      try {
        const response = await fetch(`${API_URL}/login`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCSRFToken()
          },
          body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        if (response.ok && data.success) {
          window.location.href = "/dashboard";
        } else {
          console.log(data.message || "Login failed.");
        }
      } catch (err) {
        console.log("Unable to reach server.");
      }
    });
  }
});
      
