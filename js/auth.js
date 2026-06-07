// auth.js
import { apiRequest, showToast } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
  // Tab Switching
  const tabs = document.querySelectorAll('.auth-tab');
  const panels = document.querySelectorAll('.auth-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      // Add active to clicked
      tab.classList.add('active');
      const targetId = `${tab.dataset.target}-form`;
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Role Selection (Login)
  const loginRoleOptions = document.querySelectorAll('#login-form .role-option');
  loginRoleOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      loginRoleOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const input = opt.querySelector('input');
      input.checked = true;

      const emailInput = document.getElementById('login-email');
      const passwordInput = document.getElementById('login-password');
      if (input.value === 'admin') {
        emailInput.value = 'admin@agrinexus.com';
        passwordInput.value = 'admin123';
      } else {
        emailInput.value = 'farmer@example.com';
        passwordInput.value = 'password';
      }
    });
  });

  // Prefill default farmer credentials on load
  const initialEmail = document.getElementById('login-email');
  const initialPassword = document.getElementById('login-password');
  if (initialEmail && !initialEmail.value) {
    initialEmail.value = 'farmer@example.com';
    initialPassword.value = 'password';
  }



  // Login Form Submission
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const role = document.querySelector('#login-form input[name="login-role"]:checked').value;
      const btn = document.getElementById('btn-login');
      const errorDiv = document.getElementById('auth-error');

      try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Authenticating...';
        errorDiv.textContent = '';

        // FastAPI OAuth2PasswordRequestForm requires form data
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const data = await apiRequest('/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData.toString()
        });

        if (data.access_token) {
          localStorage.setItem('agrinexus_token', data.access_token);
          // Store basic user info
          localStorage.setItem('agrinexus_user', JSON.stringify({ email, role }));
          showToast('Login successful!');

          setTimeout(() => {
            window.location.href = role === 'admin' ? 'admin.html' : 'farmer.html';
          }, 1000);
        }
      } catch (error) {
        errorDiv.textContent = error.message;
        showToast(error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Access Dashboard</span><i class="fa-solid fa-arrow-right"></i>';
      }
    });
  }

  // Register Form Submission
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('reg-name').value;
      const email = document.getElementById('reg-email').value;
      const password = document.getElementById('reg-password').value;
      const role = 'farmer';
      const btn = document.getElementById('btn-register');
      const errorDiv = document.getElementById('auth-error');

      try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Creating...';
        errorDiv.textContent = '';

        const data = await apiRequest('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: email,
            password: password,
            full_name: name,
            role: role
          })
        });

        showToast('Account created! Please log in.');

        // Switch to login tab
        setTimeout(() => {
          document.querySelector('.auth-tab[data-target="login"]').click();
          document.getElementById('login-email').value = email;
        }, 1500);

      } catch (error) {
        errorDiv.textContent = error.message;
        showToast(error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Create Account</span><i class="fa-solid fa-user-plus"></i>';
      }
    });
  }
});
