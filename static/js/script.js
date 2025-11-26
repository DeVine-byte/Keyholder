// CSRF TOKEN READER
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
  //  Modal Handling (FIXED)
  // ---------------------------
  const authBtns = document.getElementsByClassName("authBtn");  
  const modal = document.getElementById("authModal");
  const closeBtn = document.querySelector(".close");

  // Add click listener to *all* buttons with class authBtn
  Array.from(authBtns).forEach((btn) => {
    btn.addEventListener("click", () => {
      modal.style.display = "block";
    });
  });

  closeBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  // ---------------------------
  //  Tab Switching
  // ---------------------------
  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  loginTab.addEventListener("click", () => {
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
    loginForm.classList.add("active");
    registerForm.classList.remove("active");
  });

  registerTab.addEventListener("click", () => {
    registerTab.classList.add("active");
    loginTab.classList.remove("active");
    registerForm.classList.add("active");
    loginForm.classList.remove("active");
  });

  // ---------------------------
  //  API Endpoint
  // ---------------------------
  const API_URL = "/api/auth";

  // ---------------------------
  //  REGISTER
  // ---------------------------
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("registerUsername").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value.trim();

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

    if (data.success) {
      window.location.href = "/dashboard";   // CLEAN redirect
    } else {
      alert(data.message || "Registration failed.");
    }
  });

  // ---------------------------
  //  LOGIN
  // ---------------------------
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

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

    if (data.success) {
      window.location.href = "/dashboard";   // CLEAN redirect
    } else {
      alert(data.message || "Login failed.");
    }
  });

});
      
