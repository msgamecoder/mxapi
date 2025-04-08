 // Token from URL
 const urlParams = new URLSearchParams(window.location.search);
 const token = urlParams.get('token');
 const messageDiv = document.getElementById("message");

 if (!token) {
   messageDiv.textContent = "❌ Invalid or expired reset link!";
   setTimeout(() => window.location.href = "/", 3000);
 }

 // Welcome messages
 const messages = [
   "Wow wow wow! 🌟✨ Welcome to MSWorld! 🎉",
   "Hey there! 🎊 Welcome aboard MSWorld!",
   "Hola amigo! 🎉 Bienvenido a MSWorld!",
   "Boom! 💥 You’re now part of MSWorld! 🚀",
   "Welcome, legend! 🌟 Glad to have you here!",
   "Cheers! 🥂 Welcome to the MSWorld squad!"
 ];
 const welcomeElement = document.getElementById("staticWelcomeMessage");
 let index = 0;
 setInterval(() => {
   index = (index + 1) % messages.length;
   welcomeElement.textContent = messages[index];
 }, 8000);

 // Eye toggles
 document.getElementById("toggleNewPassword").addEventListener("click", () => {
   togglePassword("newPassword", "toggleNewPassword");
 });
 document.getElementById("toggleConfirmPassword").addEventListener("click", () => {
   togglePassword("confirmPassword", "toggleConfirmPassword");
 });

 function togglePassword(inputId, iconId) {
   const input = document.getElementById(inputId);
   const icon = document.getElementById(iconId);
   if (input.type === "password") {
     input.type = "text";
     icon.classList.replace("fa-eye", "fa-eye-slash");
   } else {
     input.type = "password";
     icon.classList.replace("fa-eye-slash", "fa-eye");
   }
 }

 // Submit
 document.getElementById("resetForm").addEventListener("submit", async (e) => {
   e.preventDefault();

   const newPassword = document.getElementById("newPassword").value;
   const confirmPassword = document.getElementById("confirmPassword").value;

   if (newPassword !== confirmPassword) return showError("Passwords do not match! 🚫");

   if (newPassword.length < 8) return showError("Password must be at least 8 characters long! 🚫");
   if (newPassword.length > 10) return showError("Password must not exceed 10 characters! 🚫");
   if (!/[A-Z]/.test(newPassword)) return showError("Must include at least one uppercase letter 🔠");
   if (!/[a-z]/.test(newPassword)) return showError("Must include at least one lowercase letter 🔡");
   if (!/\d/.test(newPassword)) return showError("Must include at least one number 🔢");
   if (!/[@$!%*?&]/.test(newPassword)) return showError("Must include at least one special character 🔣");

   const response = await fetch("https://mxapi.onrender.com/mx/reset-password", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ token, newPassword })
   });

   const result = await response.json();

   if (response.ok) {
     alert(result.message);
     document.getElementById("resetForm").reset();
     setTimeout(() => {
       window.location.href = "https://mxgamecoder.lovestoblog.com/login.html";
     }, 2000);
   } else {
     showError(`❌ ${result.error || "Something went wrong!"}`);
   }
 });

 function showError(msg) {
   messageDiv.style.color = "red";
   messageDiv.style.opacity = "1";
   messageDiv.textContent = msg;
   setTimeout(() => {
     messageDiv.style.transition = "opacity 1s";
     messageDiv.style.opacity = "0";
   }, 5000);
 }
